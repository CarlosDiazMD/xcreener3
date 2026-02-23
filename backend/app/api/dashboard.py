"""
Dashboard API for Xcreener 2.0

Provides market overview, stats, and recent activity.
"""

import logging
from datetime import datetime, date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.auth import get_user_from_token
from app.models.db_models import (
    User, Ticker, Signal, JournalEntry, FetchLog,
    ExchangeType, SignalType, Timeframe,
)
from app.models.schemas import DashboardStats

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    user: User = Depends(get_user_from_token),
    db: AsyncSession = Depends(get_db),
):
    """Get dashboard statistics."""
    today = date.today()
    week_ago = today - timedelta(days=7)

    total_tickers = await db.scalar(select(func.count(Ticker.id)))
    active_tickers = await db.scalar(
        select(func.count(Ticker.id)).where(Ticker.is_active == True)
    )
    signals_today = await db.scalar(
        select(func.count(Signal.id)).where(Signal.signal_date == today)
    )
    signals_week = await db.scalar(
        select(func.count(Signal.id)).where(Signal.signal_date >= week_ago)
    )
    buy_today = await db.scalar(
        select(func.count(Signal.id)).where(
            Signal.signal_date == today, Signal.signal_type == SignalType.BUY
        )
    )
    sell_today = await db.scalar(
        select(func.count(Signal.id)).where(
            Signal.signal_date == today, Signal.signal_type == SignalType.SELL
        )
    )

    # Last data update
    last_fetch = await db.scalar(
        select(func.max(FetchLog.completed_at)).where(FetchLog.status == "completed")
    )

    # Journal stats
    open_trades = await db.scalar(
        select(func.count(JournalEntry.id)).where(
            JournalEntry.user_id == user.id,
            JournalEntry.status == "open",
        )
    )
    total_pnl = await db.scalar(
        select(func.coalesce(func.sum(JournalEntry.pnl), 0)).where(
            JournalEntry.user_id == user.id,
            JournalEntry.status == "closed",
        )
    )

    return DashboardStats(
        total_tickers=total_tickers or 0,
        active_tickers=active_tickers or 0,
        signals_today=signals_today or 0,
        signals_this_week=signals_week or 0,
        buy_signals_today=buy_today or 0,
        sell_signals_today=sell_today or 0,
        last_data_update=last_fetch,
        journal_open_trades=open_trades or 0,
        journal_total_pnl=float(total_pnl or 0),
    )


@router.get("/ticker-stats")
async def get_ticker_stats(
    user: User = Depends(get_user_from_token),
    db: AsyncSession = Depends(get_db),
):
    """Get ticker universe breakdown."""
    stats = {}
    for exchange in ExchangeType:
        count = await db.scalar(
            select(func.count(Ticker.id)).where(
                Ticker.exchange == exchange, Ticker.is_active == True
            )
        )
        stats[exchange.value] = count or 0

    return {"exchanges": stats, "total": sum(stats.values())}


@router.get("/recent-signals")
async def get_recent_signals(
    timeframe: str = None,
    signal_type: str = None,
    exchange: str = None,
    limit: int = 50,
    user: User = Depends(get_user_from_token),
    db: AsyncSession = Depends(get_db),
):
    """Get recent signals with optional filters."""
    from app.services.analyzer import analyzer

    tf = Timeframe(timeframe) if timeframe else None
    st = SignalType(signal_type) if signal_type else None
    ex = ExchangeType(exchange) if exchange else None

    return await analyzer.get_recent_signals(
        timeframe=tf, signal_type=st, exchange=ex, limit=limit
    )


@router.get("/fetch-status")
async def get_fetch_status(
    user: User = Depends(get_user_from_token),
):
    """Get current data fetch progress."""
    from app.services.data_fetcher import data_fetcher
    return data_fetcher.get_progress()
