"""
Scanner API for Xcreener 2.0

On-demand scanning and manual trigger endpoints.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.auth import get_user_from_token
from app.models.db_models import User, Timeframe

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/scanner", tags=["Scanner"])


@router.post("/run/{timeframe}")
async def run_scan(
    timeframe: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_user_from_token),
):
    """
    Trigger a scan for a specific timeframe.
    Runs in background to avoid request timeout.
    """
    try:
        tf = Timeframe(timeframe)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid timeframe: {timeframe}")

    from app.services.analyzer import analyzer

    if analyzer.is_running:
        return {"status": "already_running", "progress": analyzer.progress}

    async def _run_scan():
        signals = await analyzer.scan_all(tf)
        # Optionally dispatch alerts
        from app.services.alerts import alert_service
        await alert_service.dispatch_signals(signals, tf.value)

    background_tasks.add_task(_run_scan)

    return {"status": "started", "timeframe": timeframe}


@router.get("/progress")
async def get_scan_progress(user: User = Depends(get_user_from_token)):
    """Get current scan progress."""
    from app.services.analyzer import analyzer
    return analyzer.progress


@router.post("/analyze/{symbol}")
async def analyze_single_ticker(
    symbol: str,
    timeframe: str = "daily",
    user: User = Depends(get_user_from_token),
):
    """Analyze a single ticker on demand."""
    try:
        tf = Timeframe(timeframe)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid timeframe: {timeframe}")

    from app.services.analyzer import analyzer
    result = await analyzer.analyze_single(symbol.upper(), tf)

    if result:
        return {"signal": result}
    else:
        return {"signal": None, "message": f"No signal detected for {symbol} on {timeframe}"}


@router.post("/update-data")
async def trigger_data_update(
    background_tasks: BackgroundTasks,
    user: User = Depends(get_user_from_token),
):
    """Manually trigger a data update (admin-like feature)."""
    from app.services.data_fetcher import data_fetcher

    if data_fetcher.is_running:
        return {"status": "already_running", "progress": data_fetcher.get_progress()}

    background_tasks.add_task(data_fetcher.update_all_daily)
    return {"status": "started"}


@router.post("/refresh-universe")
async def trigger_universe_refresh(
    background_tasks: BackgroundTasks,
    user: User = Depends(get_user_from_token),
):
    """Manually trigger ticker universe refresh."""
    from app.services.ticker_manager import ticker_manager

    async def _refresh():
        await ticker_manager.refresh_universe()

    background_tasks.add_task(_refresh)
    return {"status": "started"}


@router.get("/tickers")
async def search_tickers(
    q: str = "",
    exchange: str = None,
    user: User = Depends(get_user_from_token),
):
    """Search tickers by symbol or name."""
    from app.services.ticker_manager import ticker_manager
    from app.models.db_models import ExchangeType

    ex = ExchangeType(exchange) if exchange else None
    tickers = await ticker_manager.search_tickers(q, exchange=ex)

    return [
        {
            "symbol": t.symbol,
            "name": t.name,
            "exchange": t.exchange.value,
            "is_active": t.is_active,
        }
        for t in tickers
    ]


@router.post("/initial-load")
async def trigger_initial_load(
    background_tasks: BackgroundTasks,
    force: bool = False,
    user: User = Depends(get_user_from_token),
):
    """
    Trigger initial historical data load for tickers that haven't been loaded yet.
    Fetches 2y of data per ticker (vs 5d for daily updates).
    If force=True, reloads ALL active tickers.
    """
    from app.services.data_fetcher import data_fetcher

    if data_fetcher.is_running:
        return {"status": "already_running", "progress": data_fetcher.get_progress()}

    background_tasks.add_task(data_fetcher.initial_load, None, force)
    return {"status": "started", "force": force}


@router.get("/fetch-progress")
async def get_fetch_progress(user: User = Depends(get_user_from_token)):
    """Get current data fetch progress."""
    from app.services.data_fetcher import data_fetcher
    return data_fetcher.get_progress()
