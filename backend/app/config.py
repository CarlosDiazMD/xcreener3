from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://xcreener:xcreener2025@localhost:5432/xcreener2"
    database_url_sync: str = "postgresql+psycopg2://xcreener:xcreener2025@localhost:5432/xcreener2"

    # JWT Auth
    secret_key: str = "change-this-to-a-random-secret-key-at-least-32-chars"
    access_token_expire_minutes: int = 1440  # 24 hours
    algorithm: str = "HS256"

    # Telegram
    telegram_bot_token: str = ""

    # Scheduler
    daily_scan_hour: int = 18
    daily_scan_minute: int = 0
    weekly_scan_day: str = "fri"

    # Data Fetcher
    fetch_batch_size: int = 50
    fetch_timeout_seconds: int = 10
    fetch_max_retries: int = 2
    historical_period: str = "10y"

    # App
    app_name: str = "Xcreener 2.0"
    debug: bool = True
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
