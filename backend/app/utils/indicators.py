"""
Technical Indicators for Xcreener 2.0

Strategy: "SQZ RSI ADX" by @CarlosDiazBrokr
Combines Squeeze Momentum color transitions with RSI and ADX + slope
confirmation filters (N-of-3 system).

Pine Script v6 reference: strategy("SQZ RSI ADX")
"""

import numpy as np
import pandas as pd
from typing import Tuple, Optional


# ═══════════════════════════════════════════════════════════════════
#  RSI
# ═══════════════════════════════════════════════════════════════════

def calculate_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """
    RSI using Wilder's smoothing (ta.rsi equivalent).
    """
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)

    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50)


# ═══════════════════════════════════════════════════════════════════
#  ADX + Slope
# ═══════════════════════════════════════════════════════════════════

def calculate_adx(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    di_len: int = 14,
    adx_smooth: int = 14,
) -> Tuple[pd.Series, pd.Series, pd.Series]:
    """
    Calculate ADX, +DI, -DI using Wilder's smoothing.
    Matches Pine Script ta.rma-based ADX calculation.

    Pine Script reference:
        up   = ta.change(high)
        down = -ta.change(low)
        trur = ta.rma(ta.tr, diLen)
        plus  = nz(100 * ta.rma(... , diLen) / trur)
        minus = nz(100 * ta.rma(... , diLen) / trur)
        adx   = 100 * ta.rma(abs(plus - minus) / sumDM, adxSmth)

    Returns:
        (adx, plus_di, minus_di)
    """
    # Directional movement
    up = high.diff()
    down = -low.diff()

    # +DM and -DM
    plus_dm = pd.Series(np.where((up > down) & (up > 0), up, 0.0), index=high.index)
    minus_dm = pd.Series(np.where((down > up) & (down > 0), down, 0.0), index=high.index)

    # True Range
    tr = pd.DataFrame({
        "hl": high - low,
        "hc": (high - close.shift()).abs(),
        "lc": (low - close.shift()).abs(),
    }).max(axis=1)

    # Wilder's smoothing (ta.rma = ewm with alpha=1/period)
    atr = tr.ewm(alpha=1 / di_len, min_periods=di_len, adjust=False).mean()
    plus_di_smooth = plus_dm.ewm(alpha=1 / di_len, min_periods=di_len, adjust=False).mean()
    minus_di_smooth = minus_dm.ewm(alpha=1 / di_len, min_periods=di_len, adjust=False).mean()

    # +DI and -DI as percentage
    plus_di = (100 * plus_di_smooth / atr.replace(0, np.nan)).fillna(0)
    minus_di = (100 * minus_di_smooth / atr.replace(0, np.nan)).fillna(0)

    # ADX = 100 * rma(abs(+DI - -DI) / (+DI + -DI), adx_smooth)
    sum_dm = plus_di + minus_di
    dx = (abs(plus_di - minus_di) / sum_dm.replace(0, 1)) * 100
    adx = dx.ewm(alpha=1 / adx_smooth, min_periods=adx_smooth, adjust=False).mean()

    return adx, plus_di, minus_di


def calculate_adx_slope(
    adx: pd.Series,
    slope_len: int = 2,
) -> Tuple[pd.Series, pd.Series, pd.Series]:
    """
    ADX slope and its zero-crossing signals.

    Pine Script reference:
        adxSlope  = (adx - adx[slopeLen]) / slopeLen
        slopeUp   = adxSlope > 0 and adxSlope[1] <= 0
        slopeDown = adxSlope < 0 and adxSlope[1] >= 0

    Returns:
        (adx_slope, slope_up, slope_down)
    """
    adx_slope = (adx - adx.shift(slope_len)) / slope_len
    prev_slope = adx_slope.shift(1)

    slope_up = (adx_slope > 0) & (prev_slope <= 0)
    slope_down = (adx_slope < 0) & (prev_slope >= 0)

    return adx_slope, slope_up, slope_down


# ═══════════════════════════════════════════════════════════════════
#  Squeeze Momentum
# ═══════════════════════════════════════════════════════════════════

def calculate_sma(series: pd.Series, period: int) -> pd.Series:
    """Simple Moving Average."""
    return series.rolling(window=period, min_periods=period).mean()


def calculate_ema(series: pd.Series, period: int) -> pd.Series:
    """Exponential Moving Average."""
    return series.ewm(span=period, adjust=False).mean()


def calculate_squeeze_momentum(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    sq_len: int = 20,
    bb_mult: float = 2.0,
    kc_mult: float = 1.5,
) -> Tuple[pd.Series, pd.Series]:
    """
    Calculate Squeeze Momentum (LazyBear-style).

    Pine Script reference (strategy version):
        bbBasis = ta.sma(close, sqLen)
        bbDev   = bbMult * ta.stdev(close, sqLen)
        kcBasis = ta.sma(close, sqLen)
        kcR     = ta.sma(useTR ? ta.tr : (high - low), sqLen)
        sqzMom  = ta.linreg(close - ((m1 + m2) / 2.0), sqLen, 0)

    NOTE: The strategy uses bbMult=2.0 for BB (separate from kcMult=1.5).

    Returns:
        (squeeze_on, momentum)
    """
    # === Bollinger Bands ===
    bb_basis = calculate_sma(close, sq_len)
    bb_dev = close.rolling(window=sq_len, min_periods=sq_len).std() * bb_mult
    bb_upper = bb_basis + bb_dev
    bb_lower = bb_basis - bb_dev

    # === Keltner Channels ===
    kc_basis = calculate_sma(close, sq_len)
    tr = pd.DataFrame({
        "hl": high - low,
        "hc": (high - close.shift()).abs(),
        "lc": (low - close.shift()).abs(),
    }).max(axis=1)
    kc_range = calculate_sma(tr, sq_len)
    kc_upper = kc_basis + kc_mult * kc_range
    kc_lower = kc_basis - kc_mult * kc_range

    # Squeeze detection
    squeeze_on = (bb_lower > kc_lower) & (bb_upper < kc_upper)

    # === Momentum ===
    # val = linreg(close - avg(avg(highest(high,L), lowest(low,L)), sma(close,L)), L, 0)
    hh = high.rolling(window=sq_len, min_periods=sq_len).max()
    ll = low.rolling(window=sq_len, min_periods=sq_len).min()
    m1 = (hh + ll) / 2.0
    m2 = calculate_sma(close, sq_len)
    delta = close - ((m1 + m2) / 2.0)
    momentum = _linreg(delta, sq_len)

    return squeeze_on, momentum


def _linreg(series: pd.Series, period: int) -> pd.Series:
    """
    Linear regression endpoint value.
    Equivalent to Pine Script's ta.linreg(source, length, 0).
    """
    result = pd.Series(index=series.index, dtype=float)
    x = np.arange(period, dtype=float)
    x_mean = x.mean()
    x_var = ((x - x_mean) ** 2).sum()

    values = series.values
    for i in range(period - 1, len(values)):
        window = values[i - period + 1: i + 1]
        if np.any(np.isnan(window)):
            result.iloc[i] = np.nan
            continue
        y_mean = np.mean(window)
        slope = np.sum((x - x_mean) * (window - y_mean)) / x_var
        intercept = y_mean - slope * x_mean
        result.iloc[i] = intercept + slope * (period - 1)

    return result


def get_squeeze_colors(
    momentum: pd.Series,
) -> Tuple[pd.Series, pd.Series, pd.Series, pd.Series]:
    """
    Classify momentum bars into 4 color states.

    Pine Script:
        isPos   = sqzMom > 0
        isNeg   = sqzMom < 0
        rising  = sqzMom > sqzMom[1]
        falling = sqzMom < sqzMom[1]

        brightG = isPos and rising     (lime)
        darkG   = isPos and falling    (green)
        brightR = isNeg and falling    (red)
        darkR   = isNeg and rising     (maroon)

    Returns:
        (bright_green, dark_green, bright_red, dark_red) — all boolean Series
    """
    prev_mom = momentum.shift(1)
    is_pos = momentum > 0
    is_neg = momentum < 0
    rising = momentum > prev_mom
    falling = momentum < prev_mom

    bright_green = is_pos & rising    # lime   — bullish, accelerating
    dark_green = is_pos & falling     # green  — bullish, decelerating
    bright_red = is_neg & falling     # red    — bearish, accelerating
    dark_red = is_neg & rising        # maroon — bearish, decelerating

    return bright_green, dark_green, bright_red, dark_red


# ═══════════════════════════════════════════════════════════════════
#  Weekly / Monthly resampling
# ═══════════════════════════════════════════════════════════════════

def resample_to_weekly(df: pd.DataFrame) -> pd.DataFrame:
    """Resample daily OHLCV to weekly (Monday-Friday candles)."""
    return df.resample("W").agg({
        "Open": "first",
        "High": "max",
        "Low": "min",
        "Close": "last",
        "Volume": "sum",
    }).dropna()


def resample_to_monthly(df: pd.DataFrame) -> pd.DataFrame:
    """Resample daily OHLCV to monthly."""
    # Use 'M' for broad pandas compat (pre-2.2) with fallback to 'ME'
    try:
        result = df.resample("ME").agg({
            "Open": "first",
            "High": "max",
            "Low": "min",
            "Close": "last",
            "Volume": "sum",
        }).dropna()
    except Exception:
        result = df.resample("M").agg({
            "Open": "first",
            "High": "max",
            "Low": "min",
            "Close": "last",
            "Volume": "sum",
        }).dropna()
    return result


# ═══════════════════════════════════════════════════════════════════
#  Signal Analysis — SQZ RSI ADX Strategy
# ═══════════════════════════════════════════════════════════════════

def analyze_signals(
    df: pd.DataFrame,
    # RSI parameters
    rsi_len: int = 14,
    rsi_buy: float = 40.0,
    rsi_sell: float = 60.0,
    # ADX parameters
    di_len: int = 14,
    adx_smooth: int = 14,
    slope_len: int = 2,
    adx_buy: float = 40.0,
    adx_sell: float = 50.0,
    # SQZ parameters
    sq_len: int = 20,
    bb_mult: float = 2.0,
    kc_mult: float = 1.5,
    # Confirmation (N-of-3, user runs with min=1)
    buy_min: int = 1,
    sell_min: int = 1,
) -> Optional[dict]:
    """
    Analyze using the SQZ RSI ADX strategy.

    BUY signal:
        1. SQZ momentum color transition: brightRed[1] → darkRed
           (bearish momentum was accelerating, now decelerating — reversal setup)
        2. At least buy_min of: RSI < rsi_buy, ADX < adx_buy, slopeUp
    
    SELL signal:
        1. SQZ momentum color transition: brightGreen[1] → darkGreen
           (bullish momentum was accelerating, now decelerating — exhaustion)
        2. At least sell_min of: RSI > rsi_sell, ADX > adx_sell, slopeDown
    
    Returns dict with signal info or None.
    """
    # SQZ needs sq_len (20) bars + 1; ADX stabilizes by ~22 bars
    min_bars = sq_len + 2
    if df is None or len(df) < min_bars:
        return None

    close = df["Close"]
    high = df["High"]
    low = df["Low"]

    # === Calculate all indicators ===
    rsi = calculate_rsi(close, rsi_len)
    adx, plus_di, minus_di = calculate_adx(high, low, close, di_len, adx_smooth)
    adx_slope, slope_up, slope_down = calculate_adx_slope(adx, slope_len)
    squeeze_on, momentum = calculate_squeeze_momentum(
        high, low, close, sq_len, bb_mult, kc_mult
    )

    # Need at least 2 bars for transitions
    if len(momentum.dropna()) < 2:
        return None

    # === SQZ momentum color states ===
    bright_green, dark_green, bright_red, dark_red = get_squeeze_colors(momentum)

    # === SQZ transitions (the core signal trigger) ===
    # sqzBuy  = brightR[1] and darkR   (bearish deceleration)
    # sqzSell = brightG[1] and darkG   (bullish deceleration)
    sqz_buy = bright_red.shift(1).fillna(False) & dark_red
    sqz_sell = bright_green.shift(1).fillna(False) & dark_green

    # === N-of-3 confirmation ===
    buy_count = (
        (rsi < rsi_buy).astype(int)
        + (adx < adx_buy).astype(int)
        + slope_up.astype(int)
    )
    sell_count = (
        (rsi > rsi_sell).astype(int)
        + (adx > adx_sell).astype(int)
        + slope_down.astype(int)
    )

    buy_signal = sqz_buy & (buy_count >= buy_min)
    sell_signal = sqz_sell & (sell_count >= sell_min)

    # Check latest bar
    current_buy = bool(buy_signal.iloc[-1]) if pd.notna(buy_signal.iloc[-1]) else False
    current_sell = bool(sell_signal.iloc[-1]) if pd.notna(sell_signal.iloc[-1]) else False

    signal = None
    if current_buy:
        signal = "BUY"
    elif current_sell:
        signal = "SELL"

    if signal:
        cur_rsi = float(rsi.iloc[-1])
        cur_adx = float(adx.iloc[-1])
        cur_mom = float(momentum.iloc[-1])
        cur_squeeze = bool(squeeze_on.iloc[-1])
        cur_slope = float(adx_slope.iloc[-1]) if pd.notna(adx_slope.iloc[-1]) else 0.0

        # Determine which confirmations fired
        confirmations = []
        if signal == "BUY":
            if cur_rsi < rsi_buy:
                confirmations.append(f"RSI({cur_rsi:.1f}) < {rsi_buy}")
            if cur_adx < adx_buy:
                confirmations.append(f"ADX({cur_adx:.1f}) < {adx_buy}")
            if bool(slope_up.iloc[-1]):
                confirmations.append(f"ADX slope UP ({cur_slope:.2f})")
        else:
            if cur_rsi > rsi_sell:
                confirmations.append(f"RSI({cur_rsi:.1f}) > {rsi_sell}")
            if cur_adx > adx_sell:
                confirmations.append(f"ADX({cur_adx:.1f}) > {adx_sell}")
            if bool(slope_down.iloc[-1]):
                confirmations.append(f"ADX slope DOWN ({cur_slope:.2f})")

        return {
            "signal_type": signal,
            "price": float(close.iloc[-1]),
            "rsi": cur_rsi,
            "momentum": cur_mom,
            "squeeze_on": cur_squeeze,
            "date": df.index[-1],
            "details": {
                "adx": cur_adx,
                "adx_slope": cur_slope,
                "plus_di": float(plus_di.iloc[-1]),
                "minus_di": float(minus_di.iloc[-1]),
                "prev_momentum": float(momentum.iloc[-2]),
                "sqz_trigger": "brightRed→darkRed" if signal == "BUY" else "brightGreen→darkGreen",
                "confirmations": confirmations,
                "buy_count": int(buy_count.iloc[-1]) if signal == "BUY" else None,
                "sell_count": int(sell_count.iloc[-1]) if signal == "SELL" else None,
            },
        }

    return None
