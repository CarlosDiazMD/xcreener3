"""
Xcreener 2.0 — Main FastAPI Application

Trading analysis platform with Squeeze Momentum + RSI strategy scanning,
Telegram alerts, and a multi-user web dashboard.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO if settings.debug else logging.WARNING,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    # ─── Startup ────────────────────────────────
    logger.info("🚀 Starting Xcreener 2.0...")

    # Initialize database tables (create if they don't exist)
    from app.database import engine, Base
    from app.models.db_models import (
        Ticker, OHLCVDaily, Signal, User, AlertSent, JournalEntry, FetchLog,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        logger.info("✓ Database tables verified")

    # Start scheduler
    from app.services.scheduler import setup_scheduler
    setup_scheduler()
    logger.info("✓ Scheduler started")

    logger.info("═══ Xcreener 2.0 is ready ═══")

    yield

    # ─── Shutdown ───────────────────────────────
    from app.services.scheduler import scheduler
    scheduler.shutdown(wait=False)
    logger.info("Xcreener 2.0 shutting down...")


# Create the FastAPI app
app = FastAPI(
    title="Xcreener 2.0",
    description="Trading analysis platform — Squeeze Momentum + RSI",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
from app.api.auth import router as auth_router
from app.api.dashboard import router as dashboard_router
from app.api.scanner import router as scanner_router
from app.api.journal import router as journal_router
from app.api.alerts import router as alerts_router
from app.api.explorer import router as explorer_router

app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(scanner_router)
app.include_router(journal_router)
app.include_router(alerts_router)
app.include_router(explorer_router)


@app.get("/")
async def root():
    return {
        "name": "Xcreener 2.0",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}
