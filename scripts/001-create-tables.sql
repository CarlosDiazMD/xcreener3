-- ============================================================
-- Xcreener 2.0 - Database Schema Migration
-- Creates all tables, ENUMs, indices, and constraints
-- ============================================================

-- ENUMs
DO $$ BEGIN
    CREATE TYPE exchangetype AS ENUM ('NYSE', 'NASDAQ', 'ETF', 'CRYPTO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE signaltype AS ENUM ('BUY', 'SELL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE timeframe AS ENUM ('daily', 'weekly', 'monthly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE alertchannel AS ENUM ('telegram', 'web');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Tickers ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tickers (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255),
    exchange exchangetype NOT NULL,
    sector VARCHAR(100),
    industry VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_updated TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    error_count INTEGER DEFAULT 0,
    last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_tickers_symbol ON tickers (symbol);
CREATE INDEX IF NOT EXISTS idx_tickers_exchange ON tickers (exchange);
CREATE INDEX IF NOT EXISTS idx_tickers_is_active ON tickers (is_active);

-- ─── OHLCV Daily ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ohlcv_daily (
    id SERIAL PRIMARY KEY,
    ticker_id INTEGER NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    open DOUBLE PRECISION NOT NULL,
    high DOUBLE PRECISION NOT NULL,
    low DOUBLE PRECISION NOT NULL,
    close DOUBLE PRECISION NOT NULL,
    volume DOUBLE PRECISION,
    adj_close DOUBLE PRECISION,
    CONSTRAINT uq_ticker_date UNIQUE (ticker_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ohlcv_date ON ohlcv_daily (date);
CREATE INDEX IF NOT EXISTS idx_ohlcv_ticker_date ON ohlcv_daily (ticker_id, date);

-- ─── Signals ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS signals (
    id SERIAL PRIMARY KEY,
    ticker_id INTEGER NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
    signal_type signaltype NOT NULL,
    timeframe timeframe NOT NULL,
    signal_date DATE NOT NULL,
    price_at_signal DOUBLE PRECISION,
    rsi_value DOUBLE PRECISION,
    squeeze_momentum DOUBLE PRECISION,
    squeeze_on BOOLEAN,
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uq_signal UNIQUE (ticker_id, timeframe, signal_date, signal_type)
);

CREATE INDEX IF NOT EXISTS idx_signals_signal_type ON signals (signal_type);
CREATE INDEX IF NOT EXISTS idx_signals_timeframe ON signals (timeframe);
CREATE INDEX IF NOT EXISTS idx_signals_signal_date ON signals (signal_date);
CREATE INDEX IF NOT EXISTS idx_signal_date_type ON signals (signal_date, signal_type);

-- ─── Users ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(100) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    is_admin BOOLEAN DEFAULT FALSE,
    telegram_chat_id VARCHAR(50),
    telegram_notifications BOOLEAN DEFAULT TRUE,
    web_notifications BOOLEAN DEFAULT TRUE,
    watchlist JSONB DEFAULT '[]'::jsonb,
    preferred_timeframes JSONB DEFAULT '["daily", "weekly"]'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);

-- ─── Alerts Sent ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alerts_sent (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    signal_id INTEGER NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    channel alertchannel NOT NULL,
    sent_at TIMESTAMP DEFAULT NOW(),
    delivered BOOLEAN DEFAULT TRUE,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_alerts_user_date ON alerts_sent (user_id, sent_at);

-- ─── Journal Entries ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS journal_entries (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    direction VARCHAR(10) NOT NULL,
    entry_date DATE NOT NULL,
    entry_price DOUBLE PRECISION NOT NULL,
    exit_date DATE,
    exit_price DOUBLE PRECISION,
    shares DOUBLE PRECISION,
    stop_loss DOUBLE PRECISION,
    take_profit DOUBLE PRECISION,
    pnl DOUBLE PRECISION,
    pnl_percent DOUBLE PRECISION,
    fees DOUBLE PRECISION DEFAULT 0.0,
    timeframe VARCHAR(20),
    strategy VARCHAR(100),
    notes TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    screenshot_url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'open',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_symbol ON journal_entries (symbol);
CREATE INDEX IF NOT EXISTS idx_journal_user_date ON journal_entries (user_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_status ON journal_entries (status);

-- ─── Fetch Logs ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fetch_logs (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    total_tickers INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    skipped_count INTEGER DEFAULT 0,
    new_tickers_added INTEGER DEFAULT 0,
    tickers_delisted INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'running',
    error_details JSONB
);
