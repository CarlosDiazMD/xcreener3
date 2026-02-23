"""
Ticker Universe Manager for Xcreener 2.0

Manages the universe of tracked tickers:
- Fetches current NYSE, NASDAQ, ETF listings
- Adds new tickers, marks delisted ones as inactive
- Maintains hardcoded crypto list (BTC, ETH, SOL)
"""

import logging
from typing import List, Dict, Optional, Tuple

import pandas as pd
import yfinance as yf
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import async_session_factory
from app.models.db_models import Ticker, ExchangeType

logger = logging.getLogger(__name__)

# Hardcoded crypto symbols
CRYPTO_SYMBOLS = {
    "BTC-USD": "Bitcoin",
    "ETH-USD": "Ethereum",
    "SOL-USD": "Solana",
}

# URLs for ticker listings (using curated stock sources)
LISTING_SOURCES = {
    ExchangeType.NYSE: "https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nyse/nyse_full_tickers.json",
    ExchangeType.NASDAQ: "https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nasdaq/nasdaq_full_tickers.json",
    ExchangeType.ETF: "https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/etf/etf_full_tickers.json",
}


class TickerManager:
    """Manages ticker universe — adding, removing, validation."""

    async def get_stats(self) -> Dict:
        """Get ticker universe statistics."""
        async with async_session_factory() as session:
            total = await session.scalar(select(func.count(Ticker.id)))
            active = await session.scalar(
                select(func.count(Ticker.id)).where(Ticker.is_active == True)
            )
            by_exchange = {}
            for exchange in ExchangeType:
                count = await session.scalar(
                    select(func.count(Ticker.id)).where(
                        Ticker.exchange == exchange, Ticker.is_active == True
                    )
                )
                by_exchange[exchange.value] = count

            return {
                "total": total,
                "active": active,
                "inactive": total - active,
                "by_exchange": by_exchange,
            }

    async def refresh_universe(self) -> Dict:
        """
        Refresh the entire ticker universe:
        1. Fetch current listings from sources
        2. Add new tickers
        3. Mark delisted tickers as inactive
        4. Ensure crypto symbols are present
        
        Returns stats about what changed.
        """
        logger.info("Starting ticker universe refresh...")
        stats = {"added": 0, "delisted": 0, "reactivated": 0, "errors": []}

        async with async_session_factory() as session:
            # 1. Process each exchange
            for exchange, url in LISTING_SOURCES.items():
                try:
                    symbols = await self._fetch_listing(exchange, url)
                    if symbols:
                        result = await self._sync_exchange(session, exchange, symbols)
                        stats["added"] += result["added"]
                        stats["delisted"] += result["delisted"]
                        stats["reactivated"] += result["reactivated"]
                        logger.info(
                            f"{exchange.value}: {len(symbols)} symbols fetched, "
                            f"+{result['added']} added, -{result['delisted']} delisted"
                        )
                    else:
                        stats["errors"].append(f"No symbols for {exchange.value}")
                except Exception as e:
                    stats["errors"].append(f"{exchange.value}: {str(e)[:200]}")
                    logger.error(f"Error refreshing {exchange.value}: {e}")

            # 2. Ensure crypto symbols
            crypto_result = await self._ensure_crypto(session)
            stats["added"] += crypto_result

            await session.commit()

        logger.info(
            f"Universe refresh complete: +{stats['added']} added, "
            f"-{stats['delisted']} delisted, ↺{stats['reactivated']} reactivated"
        )
        return stats

    async def _fetch_listing(
        self, exchange: ExchangeType, url: str
    ) -> List[Dict]:
        """Fetch ticker listing from a JSON source."""
        import aiohttp

        try:
            async with aiohttp.ClientSession() as http:
                async with http.get(url, timeout=aiohttp.ClientTimeout(total=60)) as resp:
                    if resp.status == 200:
                        # GitHub raw returns text/plain, not application/json
                        data = await resp.json(content_type=None)
                        symbols = []
                        for item in data:
                            symbol = item.get("symbol", "")
                            # Filter out special characters and warrants
                            if (
                                symbol
                                and len(symbol) <= 6
                                and not any(c in symbol for c in [".", "-", "^", "$"])
                                and symbol.isalpha()
                            ):
                                symbols.append({
                                    "symbol": symbol.upper(),
                                    "name": item.get("name", ""),
                                })
                        logger.info(
                            f"{exchange.value}: {len(data)} raw items -> {len(symbols)} valid symbols"
                        )
                        return symbols
                    else:
                        logger.error(f"HTTP {resp.status} fetching {exchange.value} listing")
                        return []
        except Exception as e:
            logger.error(f"Error fetching listing for {exchange.value}: {e}", exc_info=True)
            return []

    async def _sync_exchange(
        self, session: AsyncSession, exchange: ExchangeType, symbols: List[Dict]
    ) -> Dict:
        """Sync a single exchange's symbols with the database."""
        result = {"added": 0, "delisted": 0, "reactivated": 0}

        # Get existing symbols for this exchange
        existing = await session.execute(
            select(Ticker).where(Ticker.exchange == exchange)
        )
        existing_map = {t.symbol: t for t in existing.scalars().all()}
        incoming_symbols = {s["symbol"] for s in symbols}

        # Add new symbols
        for sym_data in symbols:
            symbol = sym_data["symbol"]
            if symbol not in existing_map:
                session.add(Ticker(
                    symbol=symbol,
                    name=sym_data.get("name", ""),
                    exchange=exchange,
                    is_active=True,
                ))
                result["added"] += 1
            elif not existing_map[symbol].is_active:
                # Reactivate if it came back
                existing_map[symbol].is_active = True
                existing_map[symbol].error_count = 0
                result["reactivated"] += 1

        # Mark delisted (not in incoming list)
        for symbol, ticker in existing_map.items():
            if symbol not in incoming_symbols and ticker.is_active:
                ticker.is_active = False
                result["delisted"] += 1

        return result

    async def _ensure_crypto(self, session: AsyncSession) -> int:
        """Ensure crypto symbols exist in the database."""
        added = 0
        for symbol, name in CRYPTO_SYMBOLS.items():
            existing = await session.execute(
                select(Ticker).where(Ticker.symbol == symbol)
            )
            if not existing.scalar_one_or_none():
                session.add(Ticker(
                    symbol=symbol,
                    name=name,
                    exchange=ExchangeType.CRYPTO,
                    is_active=True,
                ))
                added += 1
        return added

    async def seed_initial_universe(self) -> Dict:
        """
        Initial seed: populate tickers from all sources.
        Use this on first run.
        """
        logger.info("Seeding initial ticker universe...")
        return await self.refresh_universe()

    async def search_tickers(
        self, query: str, exchange: Optional[ExchangeType] = None, limit: int = 20
    ) -> List[Ticker]:
        """Search tickers by symbol or name."""
        async with async_session_factory() as session:
            stmt = select(Ticker).where(
                Ticker.is_active == True,
                (Ticker.symbol.ilike(f"%{query}%")) | (Ticker.name.ilike(f"%{query}%")),
            )
            if exchange:
                stmt = stmt.where(Ticker.exchange == exchange)
            stmt = stmt.limit(limit)
            result = await session.execute(stmt)
            return list(result.scalars().all())


# Singleton
ticker_manager = TickerManager()
