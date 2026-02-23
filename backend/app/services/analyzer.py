"""
Analyzer Service for Xcreener 2.0

Runs Squeeze Momentum + RSI strategy across all active tickers
for daily, weekly, and monthly timeframes.
"""

import asyncio
import logging
import random
from datetime import datetime, date
from typing import List, Optional, Dict

import pandas as pd
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.db_models import (
    Ticker, OHLCVDaily, Signal, ExchangeType, SignalType, Timeframe,
)
from app.utils.indicators import (
    analyze_signals, resample_to_weekly, resample_to_monthly,
)

logger = logging.getLogger(__name__)


class Analyzer:
    """Runs strategy analysis across the ticker universe."""

    def __init__(self):
        self.is_running = False
        self.progress = {
            "status": "idle",
            "timeframe": None,
            "total": 0,
            "processed": 0,
            "signals_found": 0,
        }

    async def scan_all(self, timeframe: Timeframe) -> List[Dict]:
        """
        Run analysis on all active tickers for a given timeframe.
        Returns list of signals found.
        """
        if self.is_running:
            logger.warning("Analysis already in progress.")
            return []

        self.is_running = True
        all_signals = []

        try:
            async with async_session_factory() as session:
                # Get active tickers with enough data
                result = await session.execute(
                    select(Ticker).where(
                        Ticker.is_active == True,
                        Ticker.last_updated != None,
                    )
                )
                tickers = list(result.scalars().all())
                random.shuffle(tickers)

                self.progress = {
                    "status": "running",
                    "timeframe": timeframe.value,
                    "total": len(tickers),
                    "processed": 0,
                    "signals_found": 0,
                }

                logger.info(f"Starting {timeframe.value} scan for {len(tickers)} tickers")

                for i, ticker in enumerate(tickers):
                    try:
                        signal = await self._analyze_ticker(session, ticker, timeframe)
                        if signal:
                            all_signals.append(signal)
                            self.progress["signals_found"] += 1
                    except Exception as e:
                        logger.warning(f"Error analyzing {ticker.symbol}: {e}")

                    self.progress["processed"] += 1

                    # Commit signals in batches
                    if (i + 1) % 100 == 0:
                        await session.commit()

                await session.commit()
                self.progress["status"] = "completed"

                logger.info(
                    f"{timeframe.value} scan complete: "
                    f"{len(all_signals)} signals from {len(tickers)} tickers"
                )

        except Exception as e:
            logger.error(f"Fatal error in scan: {e}", exc_info=True)
            self.progress["status"] = "failed"
        finally:
            self.is_running = False

        return all_signals

    async def _analyze_ticker(
        self, session: AsyncSession, ticker: Ticker, timeframe: Timeframe
    ) -> Optional[Dict]:
        """Analyze a single ticker for signals."""

        # Fetch OHLCV data (need enough for indicators)
        min_bars = 100  # Need at least 100 daily bars
        result = await session.execute(
            select(OHLCVDaily)
            .where(OHLCVDaily.ticker_id == ticker.id)
            .order_by(OHLCVDaily.date.asc())
            .limit(2600)  # Up to ~10 years of daily data
        )
        rows = result.scalars().all()

        if len(rows) < min_bars:
            return None

        # Build DataFrame
        df = pd.DataFrame([{
            "Date": r.date,
            "Open": r.open,
            "High": r.high,
            "Low": r.low,
            "Close": r.close,
            "Volume": r.volume or 0,
        } for r in rows])
        df.set_index("Date", inplace=True)
        df.index = pd.to_datetime(df.index)

        # Resample if needed
        if timeframe == Timeframe.WEEKLY:
            df = resample_to_weekly(df)
        elif timeframe == Timeframe.MONTHLY:
            df = resample_to_monthly(df)

        # SQZ needs sq_len(20)+2 bars minimum; monthly from 2y gives ~24
        if len(df) < 22:
            return None

        # Run analysis
        signal_data = analyze_signals(df)

        if signal_data:
            # Check for duplicate signal
            existing = await session.execute(
                select(Signal).where(
                    Signal.ticker_id == ticker.id,
                    Signal.timeframe == timeframe,
                    Signal.signal_date == signal_data["date"].date()
                    if hasattr(signal_data["date"], "date")
                    else signal_data["date"],
                    Signal.signal_type == SignalType(signal_data["signal_type"]),
                )
            )
            if existing.scalar_one_or_none():
                return None  # Already recorded

            # Save signal
            signal = Signal(
                ticker_id=ticker.id,
                signal_type=SignalType(signal_data["signal_type"]),
                timeframe=timeframe,
                signal_date=signal_data["date"].date()
                if hasattr(signal_data["date"], "date")
                else signal_data["date"],
                price_at_signal=signal_data["price"],
                rsi_value=signal_data["rsi"],
                squeeze_momentum=signal_data["momentum"],
                squeeze_on=signal_data["squeeze_on"],
                details=signal_data["details"],
            )
            session.add(signal)

            return {
                "symbol": ticker.symbol,
                "name": ticker.name,
                "exchange": ticker.exchange.value,
                **signal_data,
            }

        return None

    async def analyze_single(self, symbol: str, timeframe: Timeframe) -> Optional[Dict]:
        """Analyze a single ticker on demand."""
        async with async_session_factory() as session:
            result = await session.execute(
                select(Ticker).where(Ticker.symbol == symbol)
            )
            ticker = result.scalar_one_or_none()
            if not ticker:
                return None
            signal = await self._analyze_ticker(session, ticker, timeframe)
            await session.commit()
            return signal

    async def get_recent_signals(
        self,
        timeframe: Optional[Timeframe] = None,
        signal_type: Optional[SignalType] = None,
        exchange: Optional[ExchangeType] = None,
        limit: int = 50,
    ) -> List[Dict]:
        """Get recent signals with optional filters."""
        async with async_session_factory() as session:
            stmt = (
                select(Signal, Ticker)
                .join(Ticker, Signal.ticker_id == Ticker.id)
                .order_by(Signal.created_at.desc())
            )
            if timeframe:
                stmt = stmt.where(Signal.timeframe == timeframe)
            if signal_type:
                stmt = stmt.where(Signal.signal_type == signal_type)
            if exchange:
                stmt = stmt.where(Ticker.exchange == exchange)
            stmt = stmt.limit(limit)

            result = await session.execute(stmt)
            signals = []
            for signal, ticker in result.all():
                signals.append({
                    "id": signal.id,
                    "symbol": ticker.symbol,
                    "name": ticker.name,
                    "exchange": ticker.exchange.value,
                    "signal_type": signal.signal_type.value,
                    "timeframe": signal.timeframe.value,
                    "signal_date": str(signal.signal_date),
                    "price": signal.price_at_signal,
                    "rsi": signal.rsi_value,
                    "momentum": signal.squeeze_momentum,
                    "squeeze_on": signal.squeeze_on,
                    "details": signal.details,
                    "created_at": str(signal.created_at),
                })
            return signals


# Singleton
analyzer = Analyzer()
