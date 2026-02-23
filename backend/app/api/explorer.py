"""
Ticker Explorer API for Xcreener 2.0

Endpoints for browsing the ticker universe, inspecting data quality,
and verifying OHLCV data integrity.
"""

import logging
from typing import Optional
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, and_, or_, text

from app.database import get_db
from app.api.auth import get_user_from_token
from app.models.db_models import User, Ticker, OHLCVDaily, Signal, ExchangeType

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/explorer", tags=["Explorer"])


@router.get("/tickers")
async def list_tickers(
    q: str = "",
    exchange: Optional[str] = None,
    status: str = "all",  # all, active, inactive, errors
    sort_by: str = "symbol",  # symbol, name, exchange, data_points, last_updated, error_count
    sort_dir: str = "asc",
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=200),
    user: User = Depends(get_user_from_token),
    db: AsyncSession = Depends(get_db),
):
    """
    List all tickers with data quality summary.
    Returns ticker info + OHLCV record count, date range, and error status.
    """
    # Subquery for OHLCV stats per ticker
    ohlcv_stats = (
        select(
            OHLCVDaily.ticker_id,
            func.count(OHLCVDaily.id).label("data_points"),
            func.min(OHLCVDaily.date).label("first_date"),
            func.max(OHLCVDaily.date).label("last_date"),
        )
        .group_by(OHLCVDaily.ticker_id)
        .subquery()
    )

    # Subquery for signal count per ticker
    signal_stats = (
        select(
            Signal.ticker_id,
            func.count(Signal.id).label("signal_count"),
        )
        .group_by(Signal.ticker_id)
        .subquery()
    )

    # Main query
    query = (
        select(
            Ticker,
            func.coalesce(ohlcv_stats.c.data_points, 0).label("data_points"),
            ohlcv_stats.c.first_date,
            ohlcv_stats.c.last_date,
            func.coalesce(signal_stats.c.signal_count, 0).label("signal_count"),
        )
        .outerjoin(ohlcv_stats, Ticker.id == ohlcv_stats.c.ticker_id)
        .outerjoin(signal_stats, Ticker.id == signal_stats.c.ticker_id)
    )

    # Filters
    if q:
        q_upper = q.upper()
        query = query.where(
            or_(
                Ticker.symbol.ilike(f"%{q}%"),
                Ticker.name.ilike(f"%{q}%"),
                Ticker.sector.ilike(f"%{q}%"),
                Ticker.industry.ilike(f"%{q}%"),
            )
        )

    if exchange:
        try:
            ex = ExchangeType(exchange)
            query = query.where(Ticker.exchange == ex)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid exchange: {exchange}")

    if status == "active":
        query = query.where(Ticker.is_active == True)
    elif status == "inactive":
        query = query.where(Ticker.is_active == False)
    elif status == "errors":
        query = query.where(Ticker.error_count > 0)
    elif status == "no_data":
        query = query.where(
            or_(
                ohlcv_stats.c.data_points == None,
                ohlcv_stats.c.data_points == 0,
            )
        )

    # Count total before pagination
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    # Sort
    sort_cols = {
        "symbol": Ticker.symbol,
        "name": Ticker.name,
        "exchange": Ticker.exchange,
        "data_points": func.coalesce(ohlcv_stats.c.data_points, 0),
        "last_updated": Ticker.last_updated,
        "error_count": Ticker.error_count,
        "signal_count": func.coalesce(signal_stats.c.signal_count, 0),
    }
    sort_col = sort_cols.get(sort_by, Ticker.symbol)
    if sort_dir == "desc":
        query = query.order_by(sort_col.desc())
    else:
        query = query.order_by(sort_col.asc())

    # Paginate
    offset = (page - 1) * per_page
    query = query.offset(offset).limit(per_page)

    result = await db.execute(query)
    rows = result.all()

    tickers = []
    for row in rows:
        t = row[0]  # Ticker object
        tickers.append({
            "id": t.id,
            "symbol": t.symbol,
            "name": t.name,
            "exchange": t.exchange.value if t.exchange else None,
            "sector": t.sector,
            "industry": t.industry,
            "is_active": t.is_active,
            "last_updated": t.last_updated.isoformat() if t.last_updated else None,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "error_count": t.error_count,
            "last_error": t.last_error,
            "data_points": row[1],
            "first_date": row[2].isoformat() if row[2] else None,
            "last_date": row[3].isoformat() if row[3] else None,
            "signal_count": row[4],
        })

    return {
        "tickers": tickers,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page if total > 0 else 0,
    }


@router.get("/tickers/{symbol}")
async def get_ticker_detail(
    symbol: str,
    user: User = Depends(get_user_from_token),
    db: AsyncSession = Depends(get_db),
):
    """
    Get detailed information about a single ticker,
    including data quality metrics and recent OHLCV data.
    """
    result = await db.execute(
        select(Ticker).where(Ticker.symbol == symbol.upper())
    )
    ticker = result.scalar_one_or_none()

    if not ticker:
        raise HTTPException(status_code=404, detail=f"Ticker {symbol} not found")

    # OHLCV stats
    stats_result = await db.execute(
        select(
            func.count(OHLCVDaily.id).label("total_records"),
            func.min(OHLCVDaily.date).label("first_date"),
            func.max(OHLCVDaily.date).label("last_date"),
            func.avg(OHLCVDaily.volume).label("avg_volume"),
            func.min(OHLCVDaily.close).label("min_close"),
            func.max(OHLCVDaily.close).label("max_close"),
        )
        .where(OHLCVDaily.ticker_id == ticker.id)
    )
    stats = stats_result.one()

    # Data quality checks
    quality_checks = await _run_quality_checks(db, ticker.id, stats)

    # Recent OHLCV (last 30 records)
    recent_result = await db.execute(
        select(OHLCVDaily)
        .where(OHLCVDaily.ticker_id == ticker.id)
        .order_by(OHLCVDaily.date.desc())
        .limit(30)
    )
    recent_ohlcv = recent_result.scalars().all()

    # Signal history
    signals_result = await db.execute(
        select(Signal)
        .where(Signal.ticker_id == ticker.id)
        .order_by(Signal.signal_date.desc())
        .limit(20)
    )
    signals = signals_result.scalars().all()

    return {
        "ticker": {
            "id": ticker.id,
            "symbol": ticker.symbol,
            "name": ticker.name,
            "exchange": ticker.exchange.value if ticker.exchange else None,
            "sector": ticker.sector,
            "industry": ticker.industry,
            "is_active": ticker.is_active,
            "last_updated": ticker.last_updated.isoformat() if ticker.last_updated else None,
            "created_at": ticker.created_at.isoformat() if ticker.created_at else None,
            "error_count": ticker.error_count,
            "last_error": ticker.last_error,
        },
        "data_stats": {
            "total_records": stats[0],
            "first_date": stats[1].isoformat() if stats[1] else None,
            "last_date": stats[2].isoformat() if stats[2] else None,
            "avg_volume": round(float(stats[3]), 2) if stats[3] else None,
            "min_close": round(float(stats[4]), 4) if stats[4] else None,
            "max_close": round(float(stats[5]), 4) if stats[5] else None,
        },
        "quality": quality_checks,
        "recent_ohlcv": [
            {
                "date": r.date.isoformat(),
                "open": round(r.open, 4),
                "high": round(r.high, 4),
                "low": round(r.low, 4),
                "close": round(r.close, 4),
                "volume": r.volume,
                "adj_close": round(r.adj_close, 4) if r.adj_close else None,
            }
            for r in recent_ohlcv
        ],
        "signals": [
            {
                "signal_type": s.signal_type.value,
                "timeframe": s.timeframe.value,
                "signal_date": s.signal_date.isoformat(),
                "price": s.price_at_signal,
                "rsi": s.rsi_value,
                "momentum": s.squeeze_momentum,
                "squeeze_on": s.squeeze_on,
            }
            for s in signals
        ],
    }


async def _run_quality_checks(db: AsyncSession, ticker_id: int, stats) -> dict:
    """Run data integrity checks on a ticker's OHLCV data."""
    checks = {
        "has_data": stats[0] > 0,
        "issues": [],
        "score": 100,
    }

    if not checks["has_data"]:
        checks["score"] = 0
        checks["issues"].append("No OHLCV data available")
        return checks

    # Check 1: Look for zero/negative prices
    bad_prices = await db.execute(
        select(func.count(OHLCVDaily.id))
        .where(
            OHLCVDaily.ticker_id == ticker_id,
            or_(
                OHLCVDaily.close <= 0,
                OHLCVDaily.open <= 0,
                OHLCVDaily.high <= 0,
                OHLCVDaily.low <= 0,
            ),
        )
    )
    bad_price_count = bad_prices.scalar()
    if bad_price_count > 0:
        checks["issues"].append(f"{bad_price_count} records with zero/negative prices")
        checks["score"] -= 20

    # Check 2: High > Low violation
    hl_violation = await db.execute(
        select(func.count(OHLCVDaily.id))
        .where(
            OHLCVDaily.ticker_id == ticker_id,
            OHLCVDaily.high < OHLCVDaily.low,
        )
    )
    hl_count = hl_violation.scalar()
    if hl_count > 0:
        checks["issues"].append(f"{hl_count} records where High < Low")
        checks["score"] -= 25

    # Check 3: Close outside High-Low range
    cl_violation = await db.execute(
        select(func.count(OHLCVDaily.id))
        .where(
            OHLCVDaily.ticker_id == ticker_id,
            or_(
                OHLCVDaily.close > OHLCVDaily.high,
                OHLCVDaily.close < OHLCVDaily.low,
            ),
        )
    )
    cl_count = cl_violation.scalar()
    if cl_count > 0:
        checks["issues"].append(f"{cl_count} records where Close outside High-Low range")
        checks["score"] -= 15

    # Check 4: Missing volume (null or zero)
    vol_check = await db.execute(
        select(func.count(OHLCVDaily.id))
        .where(
            OHLCVDaily.ticker_id == ticker_id,
            or_(
                OHLCVDaily.volume == None,
                OHLCVDaily.volume == 0,
            ),
        )
    )
    vol_zero = vol_check.scalar()
    total = stats[0]
    if vol_zero > total * 0.1:  # More than 10% zero volume
        checks["issues"].append(f"{vol_zero}/{total} records with zero/null volume ({round(vol_zero/total*100, 1)}%)")
        checks["score"] -= 10

    # Check 5: Gap analysis (missing trading days)
    if stats[1] and stats[2]:
        from datetime import timedelta
        first = stats[1]
        last = stats[2]
        trading_days_approx = (last - first).days * 5 / 7  # rough estimate
        if trading_days_approx > 0:
            coverage = stats[0] / trading_days_approx
            checks["coverage_pct"] = round(coverage * 100, 1)
            if coverage < 0.85:
                checks["issues"].append(f"Only {checks['coverage_pct']}% of expected trading days covered")
                checks["score"] -= 15

    checks["score"] = max(checks["score"], 0)

    if not checks["issues"]:
        checks["issues"].append("✅ All quality checks passed")

    return checks


@router.get("/stats")
async def get_universe_stats(
    user: User = Depends(get_user_from_token),
    db: AsyncSession = Depends(get_db),
):
    """Get aggregate statistics about the entire ticker universe."""

    # Total tickers by exchange and status
    exchange_stats = await db.execute(
        select(
            Ticker.exchange,
            Ticker.is_active,
            func.count(Ticker.id),
        )
        .group_by(Ticker.exchange, Ticker.is_active)
    )

    exchanges = {}
    total_active = 0
    total_inactive = 0
    for row in exchange_stats.all():
        ex_name = row[0].value if row[0] else "UNKNOWN"
        if ex_name not in exchanges:
            exchanges[ex_name] = {"active": 0, "inactive": 0}
        if row[1]:
            exchanges[ex_name]["active"] = row[2]
            total_active += row[2]
        else:
            exchanges[ex_name]["inactive"] = row[2]
            total_inactive += row[2]

    # Total OHLCV records
    total_ohlcv = await db.execute(select(func.count(OHLCVDaily.id)))
    ohlcv_count = total_ohlcv.scalar()

    # Tickers with errors
    error_tickers = await db.execute(
        select(func.count(Ticker.id)).where(Ticker.error_count > 0)
    )
    error_count = error_tickers.scalar()

    # Tickers with no data
    no_data_sub = (
        select(Ticker.id)
        .outerjoin(OHLCVDaily, Ticker.id == OHLCVDaily.ticker_id)
        .where(Ticker.is_active == True)
        .group_by(Ticker.id)
        .having(func.count(OHLCVDaily.id) == 0)
    )
    no_data_count_res = await db.execute(select(func.count()).select_from(no_data_sub.subquery()))
    no_data_count = no_data_count_res.scalar()

    # Date range in database
    date_range = await db.execute(
        select(
            func.min(OHLCVDaily.date),
            func.max(OHLCVDaily.date),
        )
    )
    dr = date_range.one()

    return {
        "exchanges": exchanges,
        "total_active": total_active,
        "total_inactive": total_inactive,
        "total_tickers": total_active + total_inactive,
        "total_ohlcv_records": ohlcv_count,
        "tickers_with_errors": error_count,
        "active_with_no_data": no_data_count,
        "data_date_range": {
            "first": dr[0].isoformat() if dr[0] else None,
            "last": dr[1].isoformat() if dr[1] else None,
        },
    }
