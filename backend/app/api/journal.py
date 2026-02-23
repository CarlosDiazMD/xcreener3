"""
Journal API for Xcreener 2.0

Trading journal / bitácora CRUD endpoints.
"""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.auth import get_user_from_token
from app.models.db_models import User, JournalEntry
from app.models.schemas import JournalCreate, JournalUpdate, JournalResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/journal", tags=["Trading Journal"])


@router.get("/", response_model=list[JournalResponse])
async def list_entries(
    status: str = None,
    symbol: str = None,
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_user_from_token),
    db: AsyncSession = Depends(get_db),
):
    """List journal entries for the current user."""
    stmt = (
        select(JournalEntry)
        .where(JournalEntry.user_id == user.id)
        .order_by(JournalEntry.entry_date.desc())
    )
    if status:
        stmt = stmt.where(JournalEntry.status == status)
    if symbol:
        stmt = stmt.where(JournalEntry.symbol == symbol.upper())
    stmt = stmt.limit(limit).offset(offset)

    result = await db.execute(stmt)
    entries = result.scalars().all()
    return [JournalResponse.model_validate(e) for e in entries]


@router.post("/", response_model=JournalResponse)
async def create_entry(
    data: JournalCreate,
    user: User = Depends(get_user_from_token),
    db: AsyncSession = Depends(get_db),
):
    """Create a new journal entry."""
    entry = JournalEntry(
        user_id=user.id,
        symbol=data.symbol.upper(),
        direction=data.direction,
        entry_date=data.entry_date,
        entry_price=data.entry_price,
        shares=data.shares,
        stop_loss=data.stop_loss,
        take_profit=data.take_profit,
        timeframe=data.timeframe,
        strategy=data.strategy,
        notes=data.notes,
        tags=data.tags,
        status="open",
    )
    db.add(entry)
    await db.flush()
    return JournalResponse.model_validate(entry)


@router.get("/{entry_id}", response_model=JournalResponse)
async def get_entry(
    entry_id: int,
    user: User = Depends(get_user_from_token),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific journal entry."""
    result = await db.execute(
        select(JournalEntry).where(
            JournalEntry.id == entry_id,
            JournalEntry.user_id == user.id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return JournalResponse.model_validate(entry)


@router.patch("/{entry_id}", response_model=JournalResponse)
async def update_entry(
    entry_id: int,
    data: JournalUpdate,
    user: User = Depends(get_user_from_token),
    db: AsyncSession = Depends(get_db),
):
    """Update a journal entry (e.g., close a trade)."""
    result = await db.execute(
        select(JournalEntry).where(
            JournalEntry.id == entry_id,
            JournalEntry.user_id == user.id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    update_data = data.model_dump(exclude_unset=True)

    # Auto-calculate PnL when closing a trade
    if "exit_price" in update_data and entry.entry_price:
        exit_price = update_data["exit_price"]
        if exit_price:
            if entry.direction == "LONG":
                pnl_per_share = exit_price - entry.entry_price
            else:
                pnl_per_share = entry.entry_price - exit_price

            shares = entry.shares or 1
            fees = update_data.get("fees", entry.fees or 0)
            update_data["pnl"] = (pnl_per_share * shares) - fees
            update_data["pnl_percent"] = (pnl_per_share / entry.entry_price) * 100

    # Auto-set status to closed if exit_price is provided
    if "exit_price" in update_data and update_data["exit_price"]:
        update_data.setdefault("status", "closed")

    for field, value in update_data.items():
        setattr(entry, field, value)

    entry.updated_at = datetime.utcnow()
    return JournalResponse.model_validate(entry)


@router.delete("/{entry_id}")
async def delete_entry(
    entry_id: int,
    user: User = Depends(get_user_from_token),
    db: AsyncSession = Depends(get_db),
):
    """Delete a journal entry."""
    result = await db.execute(
        select(JournalEntry).where(
            JournalEntry.id == entry_id,
            JournalEntry.user_id == user.id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    await db.delete(entry)
    return {"status": "deleted"}


@router.get("/stats/summary")
async def get_journal_stats(
    user: User = Depends(get_user_from_token),
    db: AsyncSession = Depends(get_db),
):
    """Get journal statistics (win rate, total PnL, etc.)."""
    # Closed trades
    closed = await db.execute(
        select(JournalEntry).where(
            JournalEntry.user_id == user.id,
            JournalEntry.status == "closed",
        )
    )
    entries = list(closed.scalars().all())

    if not entries:
        return {
            "total_trades": 0,
            "open_trades": 0,
            "win_rate": 0,
            "total_pnl": 0,
            "avg_pnl": 0,
            "best_trade": 0,
            "worst_trade": 0,
            "avg_win": 0,
            "avg_loss": 0,
        }

    pnls = [e.pnl or 0 for e in entries]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]

    open_count = await db.scalar(
        select(func.count(JournalEntry.id)).where(
            JournalEntry.user_id == user.id,
            JournalEntry.status == "open",
        )
    )

    return {
        "total_trades": len(entries),
        "open_trades": open_count or 0,
        "win_rate": len(wins) / len(entries) * 100 if entries else 0,
        "total_pnl": sum(pnls),
        "avg_pnl": sum(pnls) / len(pnls) if pnls else 0,
        "best_trade": max(pnls) if pnls else 0,
        "worst_trade": min(pnls) if pnls else 0,
        "avg_win": sum(wins) / len(wins) if wins else 0,
        "avg_loss": sum(losses) / len(losses) if losses else 0,
    }
