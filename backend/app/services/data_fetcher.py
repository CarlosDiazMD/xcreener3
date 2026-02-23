"""
Data Fetcher Service for Xcreener 2.0

Robust data fetching from Yahoo Finance with:
- Progressive batch processing (randomized order to avoid letter-A clustering)
- Per-ticker timeouts and error tracking
- Automatic skip of consistently failing tickers
- Resume capability if interrupted
- Detailed logging and progress tracking
"""

import asyncio
import logging
import random
from datetime import datetime, date, timedelta
from typing import List, Optional, Tuple

import pandas as pd
import yfinance as yf
from sqlalchemy import select, update, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import async_session_factory
from app.models.db_models import Ticker, OHLCVDaily, FetchLog, ExchangeType
from app.config import settings

logger = logging.getLogger(__name__)

# Max consecutive errors before auto-deactivating a ticker
MAX_ERROR_COUNT = 5


class DataFetcher:
    """Handles all market data fetching operations."""

    def __init__(self):
        self.is_running = False
        self.current_progress = {
            "status": "idle",
            "total": 0,
            "processed": 0,
            "success": 0,
            "errors": 0,
            "skipped": 0,
            "current_ticker": None,
        }

    def get_progress(self) -> dict:
        """Get current fetch progress."""
        total = self.current_progress["total"]
        processed = self.current_progress["processed"]
        return {
            **self.current_progress,
            "progress_percent": (processed / total * 100) if total > 0 else 0,
        }

    async def update_all_daily(self):
        """
        Main daily update: fetch latest data for all active tickers.
        
        Key design decisions:
        - Shuffles tickers randomly to distribute load evenly across alphabet
        - Processes in small batches with delays to respect rate limits
        - Skips tickers with too many consecutive errors
        - Uses per-ticker timeouts to prevent blocking on dead tickers
        - Tracks progress in DB for monitoring
        """
        if self.is_running:
            logger.warning("Fetch already in progress, skipping.")
            return

        self.is_running = True
        fetch_log = None

        try:
            async with async_session_factory() as session:
                # Get all active tickers
                result = await session.execute(
                    select(Ticker).where(
                        Ticker.is_active == True,
                        Ticker.error_count < MAX_ERROR_COUNT,
                    )
                )
                tickers = list(result.scalars().all())

                if not tickers:
                    logger.warning("No active tickers found.")
                    return

                # ⚡ CRITICAL: Shuffle to avoid getting stuck on A-tickers
                random.shuffle(tickers)

                # Create fetch log entry
                fetch_log = FetchLog(
                    total_tickers=len(tickers),
                    status="running",
                )
                session.add(fetch_log)
                await session.commit()

                self.current_progress = {
                    "status": "running",
                    "total": len(tickers),
                    "processed": 0,
                    "success": 0,
                    "errors": 0,
                    "skipped": 0,
                    "current_ticker": None,
                }

                logger.info(f"Starting daily update for {len(tickers)} tickers (shuffled)")

                # Process in batches
                batch_size = settings.fetch_batch_size
                error_details = []

                # Separate tickers that need full historical load vs incremental update
                new_tickers = [t for t in tickers if t.last_updated is None]
                existing_tickers = [t for t in tickers if t.last_updated is not None]

                logger.info(
                    f"Tickers breakdown: {len(new_tickers)} need initial load, "
                    f"{len(existing_tickers)} need daily update"
                )

                # Process new tickers one-by-one with full history
                for i, ticker in enumerate(new_tickers):
                    self.current_progress["current_ticker"] = ticker.symbol

                    try:
                        df = await self._fetch_single(
                            ticker.symbol, period=settings.historical_period
                        )
                        if df is not None and not df.empty:
                            rows_inserted = await self._upsert_ohlcv(
                                session, ticker.id, df
                            )
                            ticker.error_count = 0
                            ticker.last_error = None
                            ticker.last_updated = datetime.utcnow()
                            self.current_progress["success"] += 1
                            logger.debug(f"✓ {ticker.symbol}: {rows_inserted} rows (initial)")
                        else:
                            ticker.error_count += 1
                            ticker.last_error = "No data returned from yfinance"
                            self.current_progress["errors"] += 1
                    except Exception as e:
                        ticker.error_count += 1
                        ticker.last_error = str(e)[:500]
                        self.current_progress["errors"] += 1
                        error_details.append({"symbol": ticker.symbol, "error": str(e)[:200]})

                    self.current_progress["processed"] += 1

                    # Commit every 10 tickers and brief pause
                    if (i + 1) % 10 == 0:
                        await session.commit()
                        await asyncio.sleep(0.5)

                if new_tickers:
                    await session.commit()
                    logger.info(
                        f"Initial load phase done: {self.current_progress['success']} success out of {len(new_tickers)} new tickers"
                    )

                # Process existing tickers in batches with 5d updates
                for batch_start in range(0, len(existing_tickers), batch_size):
                    batch = existing_tickers[batch_start:batch_start + batch_size]
                    batch_symbols = [t.symbol for t in batch]

                    logger.info(
                        f"Processing batch {batch_start // batch_size + 1}/"
                        f"{(len(tickers) + batch_size - 1) // batch_size}: "
                        f"{batch_symbols[:5]}..."
                    )

                    # Fetch batch data using yfinance's batch download
                    results = await self._fetch_batch(batch_symbols)

                    # Process each ticker's result
                    for ticker in batch:
                        self.current_progress["current_ticker"] = ticker.symbol

                        if ticker.symbol in results and results[ticker.symbol] is not None:
                            try:
                                df = results[ticker.symbol]
                                if df is not None and not df.empty:
                                    rows_inserted = await self._upsert_ohlcv(
                                        session, ticker.id, df
                                    )
                                    # Reset error count on success
                                    ticker.error_count = 0
                                    ticker.last_error = None
                                    ticker.last_updated = datetime.utcnow()
                                    self.current_progress["success"] += 1
                                    logger.debug(f"✓ {ticker.symbol}: {rows_inserted} rows")
                                else:
                                    self.current_progress["skipped"] += 1
                                    logger.debug(f"⊘ {ticker.symbol}: empty data")
                            except Exception as e:
                                ticker.error_count += 1
                                ticker.last_error = str(e)[:500]
                                self.current_progress["errors"] += 1
                                error_details.append({
                                    "symbol": ticker.symbol,
                                    "error": str(e)[:200],
                                })
                                logger.warning(f"✗ {ticker.symbol}: {e}")
                        else:
                            # No data returned for this ticker
                            ticker.error_count += 1
                            ticker.last_error = "No data returned from yfinance"
                            self.current_progress["errors"] += 1
                            logger.debug(f"✗ {ticker.symbol}: no data returned")

                        self.current_progress["processed"] += 1

                    # Commit batch results
                    await session.commit()

                    # Rate limiting: brief pause between batches
                    if batch_start + batch_size < len(existing_tickers):
                        await asyncio.sleep(1.5)

                # Auto-deactivate tickers with too many errors
                deactivated = await session.execute(
                    update(Ticker)
                    .where(Ticker.error_count >= MAX_ERROR_COUNT)
                    .values(is_active=False)
                    .returning(Ticker.symbol)
                )
                deactivated_symbols = [row[0] for row in deactivated.fetchall()]
                if deactivated_symbols:
                    logger.info(
                        f"Auto-deactivated {len(deactivated_symbols)} tickers: "
                        f"{deactivated_symbols[:10]}..."
                    )

                # Update fetch log
                if fetch_log:
                    fetch_log.completed_at = datetime.utcnow()
                    fetch_log.success_count = self.current_progress["success"]
                    fetch_log.error_count = self.current_progress["errors"]
                    fetch_log.skipped_count = self.current_progress["skipped"]
                    fetch_log.status = "completed"
                    fetch_log.error_details = error_details[:100]  # Keep top 100 errors

                await session.commit()

                self.current_progress["status"] = "completed"
                logger.info(
                    f"Daily update complete: "
                    f"{self.current_progress['success']} success, "
                    f"{self.current_progress['errors']} errors, "
                    f"{self.current_progress['skipped']} skipped"
                )

        except Exception as e:
            logger.error(f"Fatal error in daily update: {e}", exc_info=True)
            self.current_progress["status"] = "failed"
            if fetch_log:
                async with async_session_factory() as session:
                    fetch_log.status = "failed"
                    fetch_log.error_details = [{"fatal": str(e)}]
                    fetch_log.completed_at = datetime.utcnow()
                    session.add(fetch_log)
                    await session.commit()
        finally:
            self.is_running = False

    async def _fetch_batch(self, symbols: List[str]) -> dict:
        """
        Fetch data for a batch of symbols using yfinance.
        Uses threading under the hood — wrapped with timeout protection.
        Returns dict of symbol -> DataFrame (or None on failure).
        """
        results = {}
        try:
            # yfinance batch download (runs in thread pool)
            loop = asyncio.get_event_loop()
            data = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    lambda: yf.download(
                        " ".join(symbols),
                        period="5d",
                        group_by="ticker",
                        auto_adjust=True,
                        threads=True,
                        progress=False,
                    ),
                ),
                timeout=settings.fetch_timeout_seconds * len(symbols),
            )

            if data is not None and not data.empty:
                if len(symbols) == 1:
                    # Single ticker: flatten MultiIndex columns
                    df = data.copy()
                    if isinstance(df.columns, pd.MultiIndex):
                        df.columns = df.columns.get_level_values(0)
                    results[symbols[0]] = df
                else:
                    # Multi-ticker: columns are MultiIndex (Ticker, Price)
                    # yfinance 1.1.0 with group_by='ticker': level 0 = ticker symbol, level 1 = OHLCV column name
                    for symbol in symbols:
                        try:
                            if isinstance(data.columns, pd.MultiIndex):
                                if symbol in data.columns.get_level_values(0):
                                    ticker_data = data.xs(symbol, level=0, axis=1)
                                else:
                                    ticker_data = None
                            else:
                                ticker_data = data[symbol] if symbol in data.columns else None
                            
                            if ticker_data is not None and not ticker_data.empty:
                                ticker_data = ticker_data.dropna(how="all")
                                if not ticker_data.empty:
                                    results[symbol] = ticker_data
                        except (KeyError, Exception) as e:
                            logger.debug(f"Batch parse error for {symbol}: {e}")
                            results[symbol] = None

        except asyncio.TimeoutError:
            logger.warning(f"Batch timeout for {symbols[:5]}...")
            # Fall back to individual fetches
            for symbol in symbols:
                try:
                    results[symbol] = await self._fetch_single(symbol, period="5d")
                except Exception:
                    results[symbol] = None

        except Exception as e:
            logger.error(f"Batch fetch error: {e}")
            for symbol in symbols:
                results[symbol] = None

        return results

    async def _fetch_single(
        self, symbol: str, period: str = "5d"
    ) -> Optional[pd.DataFrame]:
        """
        Fetch data for a single symbol with timeout protection.
        Used as fallback when batch download fails.
        """
        try:
            loop = asyncio.get_event_loop()
            data = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    lambda: yf.download(
                        symbol,
                        period=period,
                        auto_adjust=True,
                        progress=False,
                    ),
                ),
                timeout=settings.fetch_timeout_seconds,
            )
            if data is not None and not data.empty:
                # yfinance 1.1.0: flatten MultiIndex columns
                if isinstance(data.columns, pd.MultiIndex):
                    data.columns = data.columns.get_level_values(0)
                return data
            return None
        except asyncio.TimeoutError:
            logger.warning(f"Timeout fetching {symbol}")
            return None
        except Exception as e:
            logger.warning(f"Error fetching {symbol}: {e}")
            return None

    async def fetch_historical(self, symbol: str, period: str = "2y") -> Optional[pd.DataFrame]:
        """Fetch full historical data for a single symbol."""
        return await self._fetch_single(symbol, period=period)

    async def _upsert_ohlcv(
        self, session: AsyncSession, ticker_id: int, df: pd.DataFrame
    ) -> int:
        """
        Upsert OHLCV data using PostgreSQL ON CONFLICT.
        Returns number of rows inserted/updated.
        """
        if df is None or df.empty:
            return 0

        # Flatten MultiIndex columns if present (yfinance 1.1.0+)
        if isinstance(df.columns, pd.MultiIndex):
            df = df.copy()
            df.columns = df.columns.get_level_values(0)

        rows = []
        for idx, row in df.iterrows():
            dt = idx.date() if hasattr(idx, "date") else idx

            try:
                open_val = float(row["Open"])
                high_val = float(row["High"])
                low_val = float(row["Low"])
                close_val = float(row["Close"])
                volume_val = float(row["Volume"]) if "Volume" in row and pd.notna(row["Volume"]) else 0.0
            except (KeyError, TypeError, ValueError) as e:
                logger.debug(f"Skipping row for ticker {ticker_id} at {dt}: {e}")
                continue

            if pd.isna(close_val) or close_val == 0:
                continue

            rows.append({
                "ticker_id": ticker_id,
                "date": dt,
                "open": open_val,
                "high": high_val,
                "low": low_val,
                "close": close_val,
                "volume": volume_val,
                "adj_close": close_val,
            })

        if not rows:
            return 0

        stmt = pg_insert(OHLCVDaily).values(rows)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_ticker_date",
            set_={
                "open": stmt.excluded.open,
                "high": stmt.excluded.high,
                "low": stmt.excluded.low,
                "close": stmt.excluded.close,
                "volume": stmt.excluded.volume,
                "adj_close": stmt.excluded.adj_close,
            },
        )
        await session.execute(stmt)
        return len(rows)

    async def initial_load(self, symbols: Optional[List[str]] = None, force: bool = False):
        """
        Load full historical data for all or specified tickers.
        Designed for first-time setup — processes one-by-one with progress tracking.
        """
        if self.is_running:
            logger.warning("Fetch already in progress, skipping.")
            return

        self.is_running = True

        try:
            async with async_session_factory() as session:
                if symbols:
                    result = await session.execute(
                        select(Ticker).where(Ticker.symbol.in_(symbols))
                    )
                else:
                    query = select(Ticker).where(Ticker.is_active == True)
                    if not force:
                        query = query.where(Ticker.last_updated == None)
                    result = await session.execute(query)
                tickers = list(result.scalars().all())
                random.shuffle(tickers)

                self.current_progress = {
                    "status": "initial_load",
                    "total": len(tickers),
                    "processed": 0,
                    "success": 0,
                    "errors": 0,
                    "skipped": 0,
                    "current_ticker": None,
                }

                logger.info(f"Starting initial load for {len(tickers)} tickers")

                for i, ticker in enumerate(tickers):
                    self.current_progress["current_ticker"] = ticker.symbol

                    try:
                        df = await self._fetch_single(
                            ticker.symbol, period=settings.historical_period
                        )
                        if df is not None and not df.empty:
                            rows = await self._upsert_ohlcv(session, ticker.id, df)
                            ticker.last_updated = datetime.utcnow()
                            ticker.error_count = 0
                            self.current_progress["success"] += 1
                            logger.info(
                                f"[{i+1}/{len(tickers)}] ✓ {ticker.symbol}: {rows} rows"
                            )
                        else:
                            self.current_progress["skipped"] += 1
                            logger.info(f"[{i+1}/{len(tickers)}] ⊘ {ticker.symbol}: no data")
                    except Exception as e:
                        ticker.error_count += 1
                        ticker.last_error = str(e)[:500]
                        self.current_progress["errors"] += 1
                        logger.warning(f"[{i+1}/{len(tickers)}] ✗ {ticker.symbol}: {e}")

                    self.current_progress["processed"] += 1

                    # Commit every 10 tickers
                    if (i + 1) % 10 == 0:
                        await session.commit()
                        await asyncio.sleep(0.5)

                await session.commit()
                self.current_progress["status"] = "completed"
                logger.info(
                    f"Initial load complete: {self.current_progress['success']} success, "
                    f"{self.current_progress['errors']} errors"
                )

        except Exception as e:
            logger.error(f"Fatal error in initial load: {e}", exc_info=True)
            self.current_progress["status"] = "failed"
        finally:
            self.is_running = False


# Singleton instance
data_fetcher = DataFetcher()
