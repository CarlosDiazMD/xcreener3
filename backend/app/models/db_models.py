import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Date, Text,
    ForeignKey, Index, UniqueConstraint, JSON, Enum as SAEnum
)
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class ExchangeType(str, enum.Enum):
    NYSE = "NYSE"
    NASDAQ = "NASDAQ"
    ETF = "ETF"
    CRYPTO = "CRYPTO"


class SignalType(str, enum.Enum):
    BUY = "BUY"
    SELL = "SELL"


class Timeframe(str, enum.Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class AlertChannel(str, enum.Enum):
    TELEGRAM = "telegram"
    WEB = "web"


# ─── Tickers ────────────────────────────────────────────────────────────────────

class Ticker(Base):
    __tablename__ = "tickers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=True)
    exchange = Column(SAEnum(ExchangeType), nullable=False, index=True)
    sector = Column(String(100), nullable=True)
    industry = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    last_updated = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    error_count = Column(Integer, default=0)  # Track consecutive fetch errors
    last_error = Column(Text, nullable=True)

    # Relationships
    ohlcv = relationship("OHLCVDaily", back_populates="ticker", cascade="all, delete-orphan")
    signals = relationship("Signal", back_populates="ticker", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Ticker {self.symbol} ({self.exchange})>"


# ─── OHLCV Data ─────────────────────────────────────────────────────────────────

class OHLCVDaily(Base):
    __tablename__ = "ohlcv_daily"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker_id = Column(Integer, ForeignKey("tickers.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False, index=True)
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(Float, nullable=True)
    adj_close = Column(Float, nullable=True)

    # Relationships
    ticker = relationship("Ticker", back_populates="ohlcv")

    __table_args__ = (
        UniqueConstraint("ticker_id", "date", name="uq_ticker_date"),
        Index("idx_ohlcv_ticker_date", "ticker_id", "date"),
    )

    def __repr__(self):
        return f"<OHLCV {self.ticker_id} {self.date} C:{self.close}>"


# ─── Signals ─────────────────────────────────────────────────────────────────────

class Signal(Base):
    __tablename__ = "signals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker_id = Column(Integer, ForeignKey("tickers.id", ondelete="CASCADE"), nullable=False)
    signal_type = Column(SAEnum(SignalType), nullable=False, index=True)
    timeframe = Column(SAEnum(Timeframe), nullable=False, index=True)
    signal_date = Column(Date, nullable=False, index=True)
    price_at_signal = Column(Float, nullable=True)
    rsi_value = Column(Float, nullable=True)
    squeeze_momentum = Column(Float, nullable=True)
    squeeze_on = Column(Boolean, nullable=True)
    details = Column(JSON, nullable=True)  # Full indicator snapshot
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    ticker = relationship("Ticker", back_populates="signals")
    alerts = relationship("AlertSent", back_populates="signal", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("ticker_id", "timeframe", "signal_date", "signal_type", name="uq_signal"),
        Index("idx_signal_date_type", "signal_date", "signal_type"),
    )

    def __repr__(self):
        return f"<Signal {self.signal_type} {self.timeframe} {self.signal_date}>"


# ─── Users ───────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    telegram_chat_id = Column(String(50), nullable=True)
    telegram_notifications = Column(Boolean, default=True)
    web_notifications = Column(Boolean, default=True)
    watchlist = Column(JSON, default=list)  # List of ticker symbols
    preferred_timeframes = Column(JSON, default=lambda: ["daily", "weekly"])
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    # Relationships
    alerts = relationship("AlertSent", back_populates="user", cascade="all, delete-orphan")
    journal_entries = relationship("JournalEntry", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User {self.username}>"


# ─── Alerts Sent ─────────────────────────────────────────────────────────────────

class AlertSent(Base):
    __tablename__ = "alerts_sent"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    signal_id = Column(Integer, ForeignKey("signals.id", ondelete="CASCADE"), nullable=False)
    channel = Column(SAEnum(AlertChannel), nullable=False)
    sent_at = Column(DateTime, default=datetime.datetime.utcnow)
    delivered = Column(Boolean, default=True)
    error_message = Column(Text, nullable=True)

    # Relationships
    user = relationship("User", back_populates="alerts")
    signal = relationship("Signal", back_populates="alerts")

    __table_args__ = (
        Index("idx_alerts_user_date", "user_id", "sent_at"),
    )


# ─── Trading Journal ────────────────────────────────────────────────────────────

class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    symbol = Column(String(20), nullable=False, index=True)
    direction = Column(String(10), nullable=False)  # LONG or SHORT
    entry_date = Column(Date, nullable=False)
    entry_price = Column(Float, nullable=False)
    exit_date = Column(Date, nullable=True)
    exit_price = Column(Float, nullable=True)
    shares = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    take_profit = Column(Float, nullable=True)
    pnl = Column(Float, nullable=True)
    pnl_percent = Column(Float, nullable=True)
    fees = Column(Float, default=0.0)
    timeframe = Column(String(20), nullable=True)
    strategy = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    tags = Column(JSON, default=list)  # e.g. ["squeeze", "breakout", "earnings"]
    screenshot_url = Column(String(500), nullable=True)
    status = Column(String(20), default="open")  # open, closed, cancelled
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="journal_entries")

    __table_args__ = (
        Index("idx_journal_user_date", "user_id", "entry_date"),
        Index("idx_journal_status", "status"),
    )

    def __repr__(self):
        return f"<JournalEntry {self.symbol} {self.direction} {self.entry_date}>"


# ─── Data Fetch Log ─────────────────────────────────────────────────────────────

class FetchLog(Base):
    """Track data fetch operations for monitoring and debugging."""
    __tablename__ = "fetch_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    started_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    total_tickers = Column(Integer, default=0)
    success_count = Column(Integer, default=0)
    error_count = Column(Integer, default=0)
    skipped_count = Column(Integer, default=0)
    new_tickers_added = Column(Integer, default=0)
    tickers_delisted = Column(Integer, default=0)
    status = Column(String(20), default="running")  # running, completed, failed
    error_details = Column(JSON, nullable=True)

    def __repr__(self):
        return f"<FetchLog {self.started_at} {self.status}>"
