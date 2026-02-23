"""
Telegram Alert Service for Xcreener 2.0

Sends formatted trading signals to users via Telegram Bot.
"""

import logging
from typing import List, Dict, Optional

from telegram import Bot
from telegram.constants import ParseMode
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session_factory
from app.models.db_models import User, Signal, Ticker, AlertSent, AlertChannel

logger = logging.getLogger(__name__)


class AlertService:
    """Manages Telegram alert dispatching."""

    def __init__(self):
        self._bot: Optional[Bot] = None

    @property
    def bot(self) -> Optional[Bot]:
        if self._bot is None and settings.telegram_bot_token:
            self._bot = Bot(token=settings.telegram_bot_token)
        return self._bot

    async def dispatch_signals(self, signals: List[Dict], timeframe: str):
        """
        Send signals to all users subscribed to the given timeframe.
        """
        if not signals:
            logger.info(f"No {timeframe} signals to dispatch.")
            return

        if not self.bot:
            logger.warning("Telegram bot not configured, skipping alerts.")
            return

        async with async_session_factory() as session:
            # Get users with Telegram configured
            result = await session.execute(
                select(User).where(
                    User.is_active == True,
                    User.telegram_chat_id != None,
                    User.telegram_notifications == True,
                )
            )
            users = list(result.scalars().all())

            if not users:
                logger.info("No users subscribed to Telegram alerts.")
                return

            # Build the message
            message = self._format_signal_summary(signals, timeframe)

            # Send to each user
            for user in users:
                try:
                    # Check if user wants this timeframe
                    if timeframe not in (user.preferred_timeframes or ["daily", "weekly"]):
                        continue

                    await self.bot.send_message(
                        chat_id=user.telegram_chat_id,
                        text=message,
                        parse_mode=ParseMode.HTML,
                    )

                    # Log alerts sent
                    for sig in signals[:50]:  # Cap at 50 signal records
                        if "id" in sig:
                            alert = AlertSent(
                                user_id=user.id,
                                signal_id=sig["id"],
                                channel=AlertChannel.TELEGRAM,
                                delivered=True,
                            )
                            session.add(alert)

                    logger.info(f"Sent {timeframe} alert to user {user.username}")

                except Exception as e:
                    logger.error(f"Failed to send alert to {user.username}: {e}")

            await session.commit()

    async def send_test_message(self, chat_id: str, message: str = None) -> bool:
        """Send a test message to verify Telegram connection."""
        if not self.bot:
            return False
        try:
            msg = message or "✅ <b>Xcreener 2.0</b>\n\nTelegram connection verified!"
            await self.bot.send_message(
                chat_id=chat_id,
                text=msg,
                parse_mode=ParseMode.HTML,
            )
            return True
        except Exception as e:
            logger.error(f"Failed to send test message: {e}")
            return False

    def _format_signal_summary(self, signals: List[Dict], timeframe: str) -> str:
        """Format signals into a Telegram-friendly message."""
        buy_signals = [s for s in signals if s.get("signal_type") == "BUY"]
        sell_signals = [s for s in signals if s.get("signal_type") == "SELL"]

        emoji_map = {"daily": "📊", "weekly": "📈", "monthly": "🗓️"}
        tf_emoji = emoji_map.get(timeframe, "📊")

        lines = [
            f"{tf_emoji} <b>Xcreener 2.0 — {timeframe.upper()} Scan</b>",
            f"━━━━━━━━━━━━━━━━━━━━━",
            "",
        ]

        if buy_signals:
            lines.append(f"🟢 <b>BUY SIGNALS ({len(buy_signals)})</b>")
            lines.append("")
            for sig in buy_signals[:20]:  # Max 20 per type
                symbol = sig.get("symbol", "?")
                price = sig.get("price", 0)
                rsi = sig.get("rsi", 0)
                mom = sig.get("momentum", 0)
                exchange = sig.get("exchange", "")
                name = sig.get("name", "")[:25]
                lines.append(
                    f"  <b>{symbol}</b> ({exchange})"
                    f"\n  └ ${price:.2f} | RSI: {rsi:.1f} | Mom: {mom:.4f}"
                )
            lines.append("")

        if sell_signals:
            lines.append(f"🔴 <b>SELL SIGNALS ({len(sell_signals)})</b>")
            lines.append("")
            for sig in sell_signals[:20]:
                symbol = sig.get("symbol", "?")
                price = sig.get("price", 0)
                rsi = sig.get("rsi", 0)
                mom = sig.get("momentum", 0)
                exchange = sig.get("exchange", "")
                lines.append(
                    f"  <b>{symbol}</b> ({exchange})"
                    f"\n  └ ${price:.2f} | RSI: {rsi:.1f} | Mom: {mom:.4f}"
                )
            lines.append("")

        if not buy_signals and not sell_signals:
            lines.append("No signals detected for this period.")

        lines.extend([
            "━━━━━━━━━━━━━━━━━━━━━",
            f"Total: {len(buy_signals)} buys, {len(sell_signals)} sells",
            f"Strategy: Squeeze Momentum + RSI",
        ])

        return "\n".join(lines)

    def _format_single_signal(self, signal: Dict) -> str:
        """Format a single signal for immediate alert."""
        sig_type = signal.get("signal_type", "?")
        emoji = "🟢" if sig_type == "BUY" else "🔴"
        symbol = signal.get("symbol", "?")
        price = signal.get("price", 0)
        rsi = signal.get("rsi", 0)
        mom = signal.get("momentum", 0)
        timeframe = signal.get("timeframe", "?")
        squeeze = "🔵 ON" if signal.get("squeeze_on") else "⚪ OFF"

        return (
            f"{emoji} <b>{sig_type} — {symbol}</b>\n\n"
            f"💰 Price: ${price:.2f}\n"
            f"📊 RSI(14): {rsi:.1f}\n"
            f"📈 Momentum: {mom:.4f}\n"
            f"🎯 Squeeze: {squeeze}\n"
            f"⏱ Timeframe: {timeframe}\n\n"
            f"<i>Xcreener 2.0</i>"
        )


# Singleton
alert_service = AlertService()
