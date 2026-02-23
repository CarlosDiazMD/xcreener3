from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import date, datetime
from app.models.db_models import ExchangeType, SignalType, Timeframe


# ─── Auth Schemas ────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: str
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=8)


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    is_active: bool
    is_admin: bool
    telegram_chat_id: Optional[str] = None
    telegram_notifications: bool
    web_notifications: bool
    watchlist: List[str] = []
    preferred_timeframes: List[str] = []
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class UserUpdate(BaseModel):
    telegram_chat_id: Optional[str] = None
    telegram_notifications: Optional[bool] = None
    web_notifications: Optional[bool] = None
    watchlist: Optional[List[str]] = None
    preferred_timeframes: Optional[List[str]] = None


# ─── Ticker Schemas ──────────────────────────────────────────────────────────────

class TickerResponse(BaseModel):
    id: int
    symbol: str
    name: Optional[str]
    exchange: ExchangeType
    sector: Optional[str]
    industry: Optional[str]
    is_active: bool
    last_updated: Optional[datetime]

    class Config:
        from_attributes = True


class TickerSummary(BaseModel):
    symbol: str
    name: Optional[str]
    exchange: ExchangeType
    last_close: Optional[float] = None
    change_percent: Optional[float] = None


# ─── Signal Schemas ──────────────────────────────────────────────────────────────

class SignalResponse(BaseModel):
    id: int
    ticker_symbol: str
    ticker_name: Optional[str]
    signal_type: SignalType
    timeframe: Timeframe
    signal_date: date
    price_at_signal: Optional[float]
    rsi_value: Optional[float]
    squeeze_momentum: Optional[float]
    squeeze_on: Optional[bool]
    details: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SignalFilter(BaseModel):
    signal_type: Optional[SignalType] = None
    timeframe: Optional[Timeframe] = None
    exchange: Optional[ExchangeType] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    limit: int = 50
    offset: int = 0


# ─── Journal Schemas ─────────────────────────────────────────────────────────────

class JournalCreate(BaseModel):
    symbol: str
    direction: str = Field(pattern="^(LONG|SHORT)$")
    entry_date: date
    entry_price: float
    shares: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    timeframe: Optional[str] = None
    strategy: Optional[str] = None
    notes: Optional[str] = None
    tags: List[str] = []


class JournalUpdate(BaseModel):
    exit_date: Optional[date] = None
    exit_price: Optional[float] = None
    shares: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    pnl: Optional[float] = None
    pnl_percent: Optional[float] = None
    fees: Optional[float] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[str] = None


class JournalResponse(BaseModel):
    id: int
    symbol: str
    direction: str
    entry_date: date
    entry_price: float
    exit_date: Optional[date]
    exit_price: Optional[float]
    shares: Optional[float]
    stop_loss: Optional[float]
    take_profit: Optional[float]
    pnl: Optional[float]
    pnl_percent: Optional[float]
    fees: float
    timeframe: Optional[str]
    strategy: Optional[str]
    notes: Optional[str]
    tags: List[str]
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── Dashboard Schemas ───────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_tickers: int
    active_tickers: int
    signals_today: int
    signals_this_week: int
    buy_signals_today: int
    sell_signals_today: int
    last_data_update: Optional[datetime]
    journal_open_trades: int
    journal_total_pnl: float


class MarketOverview(BaseModel):
    indices: List[dict]  # SPY, QQQ, DIA latest data
    top_signals: List[SignalResponse]
    recent_alerts: List[dict]


# ─── Fetch Status ────────────────────────────────────────────────────────────────

class FetchStatusResponse(BaseModel):
    status: str
    total_tickers: int
    success_count: int
    error_count: int
    skipped_count: int
    progress_percent: float
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
