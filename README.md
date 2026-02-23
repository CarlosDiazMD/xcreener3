# ⚡ Xcreener 3.0

Trading analysis platform with **SQZ RSI ADX** signal detection, Telegram alerts, and a dark-theme web dashboard.

## Features

- 📊 **Market Data Pipeline** — 10y historical OHLCV for NYSE, NASDAQ, ETFs, BTC, ETH, SOL
- 🔍 **SQZ RSI ADX Strategy** — Squeeze Momentum color transitions + RSI + ADX slope (N-of-3 confirmation)
- 📱 **Telegram Alerts** — Automated signal notifications via Telegram Bot
- 🖥️ **Web Dashboard** — Dark-theme trading UI with signal browser
- 📓 **Trading Journal** — Track trades with auto P&L calculation
- 👥 **Multi-user** — JWT authentication with per-user preferences

## Strategy: SQZ RSI ADX

Based on the Pine Script strategy by @CarlosDiazBrokr:

- **BUY**: Squeeze momentum transitions from bright-red → dark-red + N-of-3 confirmed (RSI < 40, ADX < 40, ADX slope ↑)
- **SELL**: Squeeze momentum transitions from bright-green → dark-green + N-of-3 confirmed (RSI > 60, ADX > 50, ADX slope ↓)

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))

### 1. Configure Environment

```bash
cd backend
cp .env.example .env
# Edit .env and set TELEGRAM_BOT_TOKEN and SECRET_KEY
```

### 2. Start with Docker Compose

```bash
docker-compose up -d
```

This starts:
- **PostgreSQL** on port 5432
- **Backend API** on http://localhost:8000
- **Frontend** on http://localhost:5173

### 3. First Run

1. Open http://localhost:5173
2. Register a new account
3. Go to Settings → Configure your Telegram Chat ID
4. Go to Scanner → Click "Refresh Tickers" (loads NYSE/NASDAQ/ETF/Crypto universe)
5. Click "Update Data" (starts downloading historical data)
6. Click "Run Scan" to detect signals

## Local Development (without Docker)

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start PostgreSQL locally first, then:
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Vercel Deployment (Frontend)

The frontend can be deployed to Vercel directly from this repo:

1. Import this repo into Vercel
2. Set **Root Directory** to `frontend`
3. Set **Framework** to Vite
4. Add environment variable: `VITE_API_URL` = your backend URL (e.g. `https://your-api.railway.app`)
5. Deploy

> **Note**: The backend (FastAPI + PostgreSQL) needs a separate hosting provider like Railway, Render, or Fly.io.

## API Docs

Once running, visit http://localhost:8000/docs for interactive Swagger documentation.

## Architecture

```
backend/
  app/
    api/          → FastAPI route handlers
    models/       → SQLAlchemy models + Pydantic schemas
    services/     → Business logic (fetcher, analyzer, alerts, scheduler)
    utils/        → Technical indicator calculations
frontend/
  src/
    components/   → Sidebar, shared UI components
    pages/        → Dashboard, Scanner, Alerts, Journal, Settings
    hooks/        → Auth context
    services/     → API client
```

## Scheduled Tasks

| Task | Schedule | Description |
|------|----------|-------------|
| Daily Update | Mon-Fri 6:00 PM ET | Update data → daily scan → alerts |
| Weekly Scan | Friday 7:00 PM ET | Weekly chart analysis → alerts |
| Monthly Scan | Last day 7:30 PM ET | Monthly chart analysis → alerts |
| Universe Refresh | Saturday 10:00 AM ET | Add new / remove delisted tickers |
