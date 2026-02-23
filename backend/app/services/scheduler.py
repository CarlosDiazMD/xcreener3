"""
Scheduler Service for Xcreener 2.0

Orchestrates all automated tasks:
- Daily data updates + scans + alerts (after market close)
- Weekly scans + alerts
- Monthly scans + alerts
- Weekly ticker universe refresh
"""

import logging
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import settings
from app.models.db_models import Timeframe

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def daily_pipeline():
    """Daily pipeline: update data → analyze → alert."""
    from app.services.data_fetcher import data_fetcher
    from app.services.analyzer import analyzer
    from app.services.alerts import alert_service

    logger.info("═══ Starting daily pipeline ═══")

    # 1. Update market data
    logger.info("Step 1/3: Updating daily data...")
    await data_fetcher.update_all_daily()

    # 2. Run daily scan
    logger.info("Step 2/3: Running daily analysis...")
    signals = await analyzer.scan_all(Timeframe.DAILY)

    # 3. Send alerts
    logger.info("Step 3/3: Dispatching daily alerts...")
    await alert_service.dispatch_signals(signals, "daily")

    logger.info(f"═══ Daily pipeline complete: {len(signals)} signals ═══")


async def weekly_pipeline():
    """Weekly pipeline: analyze weekly charts → alert."""
    from app.services.analyzer import analyzer
    from app.services.alerts import alert_service

    logger.info("═══ Starting weekly pipeline ═══")

    signals = await analyzer.scan_all(Timeframe.WEEKLY)
    await alert_service.dispatch_signals(signals, "weekly")

    logger.info(f"═══ Weekly pipeline complete: {len(signals)} signals ═══")


async def monthly_pipeline():
    """Monthly pipeline: analyze monthly charts → alert."""
    from app.services.analyzer import analyzer
    from app.services.alerts import alert_service

    logger.info("═══ Starting monthly pipeline ═══")

    signals = await analyzer.scan_all(Timeframe.MONTHLY)
    await alert_service.dispatch_signals(signals, "monthly")

    logger.info(f"═══ Monthly pipeline complete: {len(signals)} signals ═══")


async def universe_refresh():
    """Weekly ticker universe refresh."""
    from app.services.ticker_manager import ticker_manager

    logger.info("═══ Refreshing ticker universe ═══")
    stats = await ticker_manager.refresh_universe()
    logger.info(f"═══ Universe refresh complete: {stats} ═══")


def setup_scheduler():
    """Configure and start the scheduler."""

    # Daily: Mon-Fri at 6:00 PM ET (after market close)
    scheduler.add_job(
        daily_pipeline,
        CronTrigger(
            day_of_week="mon-fri",
            hour=settings.daily_scan_hour,
            minute=settings.daily_scan_minute,
            timezone="US/Eastern",
        ),
        id="daily_pipeline",
        name="Daily Data Update & Scan",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    # Weekly: Friday at 7:00 PM ET
    scheduler.add_job(
        weekly_pipeline,
        CronTrigger(
            day_of_week="fri",
            hour=19,
            minute=0,
            timezone="US/Eastern",
        ),
        id="weekly_pipeline",
        name="Weekly Scan",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    # Monthly: Last business day at 7:30 PM ET
    scheduler.add_job(
        monthly_pipeline,
        CronTrigger(
            day="last",
            hour=19,
            minute=30,
            timezone="US/Eastern",
        ),
        id="monthly_pipeline",
        name="Monthly Scan",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    # Universe refresh: Saturday at 10:00 AM ET
    scheduler.add_job(
        universe_refresh,
        CronTrigger(
            day_of_week="sat",
            hour=10,
            minute=0,
            timezone="US/Eastern",
        ),
        id="universe_refresh",
        name="Ticker Universe Refresh",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    scheduler.start()
    logger.info("Scheduler started with jobs: daily, weekly, monthly, universe_refresh")

    # Log next run times
    for job in scheduler.get_jobs():
        logger.info(f"  {job.name}: next run at {job.next_run_time}")
