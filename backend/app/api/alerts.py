"""
Alerts History API for Xcreener 2.0
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.auth import get_user_from_token
from app.models.db_models import User, AlertSent, Signal, Ticker

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/alerts", tags=["Alerts"])


@router.get("/")
async def list_alerts(
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_user_from_token),
    db: AsyncSession = Depends(get_db),
):
    """List alerts sent to the current user."""
    result = await db.execute(
        select(AlertSent, Signal, Ticker)
        .join(Signal, AlertSent.signal_id == Signal.id)
        .join(Ticker, Signal.ticker_id == Ticker.id)
        .where(AlertSent.user_id == user.id)
        .order_by(AlertSent.sent_at.desc())
        .limit(limit)
        .offset(offset)
    )

    alerts = []
    for alert, signal, ticker in result.all():
        alerts.append({
            "id": alert.id,
            "symbol": ticker.symbol,
            "name": ticker.name,
            "exchange": ticker.exchange.value,
            "signal_type": signal.signal_type.value,
            "timeframe": signal.timeframe.value,
            "signal_date": str(signal.signal_date),
            "price": signal.price_at_signal,
            "rsi": signal.rsi_value,
            "momentum": signal.squeeze_momentum,
            "channel": alert.channel.value,
            "sent_at": str(alert.sent_at),
            "delivered": alert.delivered,
        })

    return alerts


@router.get("/count")
async def count_alerts(
    user: User = Depends(get_user_from_token),
    db: AsyncSession = Depends(get_db),
):
    """Get alert counts."""
    total = await db.scalar(
        select(func.count(AlertSent.id)).where(AlertSent.user_id == user.id)
    )
    return {"total": total or 0}
