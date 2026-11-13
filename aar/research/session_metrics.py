"""Session VWAP and volume profile from OHLCV (research)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from aar.core.models import Candle
from aar.core.sessions import IST, ms_to_ist_date


@dataclass
class SessionProfile:
    vwap: float
    poc: float
    va_low: float
    va_high: float
    total_volume: float
    bar_count: int


def _bucket_price(price: float, tick: float = 1.0) -> float:
    return round(price / tick) * tick


def profile_from_candles(candles: list[Candle], tick: float = 1.0) -> SessionProfile | None:
    if not candles:
        return None
    vol_by_price: dict[float, float] = {}
    vwap_num = 0.0
    vwap_den = 0.0
    for c in candles:
        tp = (c.high + c.low + c.close) / 3.0
        v = max(c.volume, 0.0)
        vwap_num += tp * v
        vwap_den += v
        for px in (c.open, c.high, c.low, c.close):
            b = _bucket_price(px, tick)
            vol_by_price[b] = vol_by_price.get(b, 0.0) + v / 4.0
    if vwap_den <= 0:
        vwap = candles[-1].close
    else:
        vwap = vwap_num / vwap_den
    if not vol_by_price:
        return SessionProfile(vwap=vwap, poc=vwap, va_low=candles[-1].low, va_high=candles[-1].high, total_volume=0, bar_count=len(candles))
    poc = max(vol_by_price.items(), key=lambda x: x[1])[0]
    sorted_levels = sorted(vol_by_price.items(), key=lambda x: -x[1])
    target = sum(vol_by_price.values()) * 0.7
    acc = 0.0
    va_prices: list[float] = []
    for px, vol in sorted_levels:
        acc += vol
        va_prices.append(px)
        if acc >= target:
            break
    return SessionProfile(
        vwap=vwap,
        poc=poc,
        va_low=min(va_prices) if va_prices else candles[-1].low,
        va_high=max(va_prices) if va_prices else candles[-1].high,
        total_volume=vwap_den,
        bar_count=len(candles),
    )


def ist_session_start_ms(d: date, session_start: time) -> int:
    dt = datetime.combine(d, session_start, tzinfo=IST)
    return int(dt.timestamp() * 1000)


def candles_in_range(all_c: list[Candle], start_ms: int, end_ms: int) -> list[Candle]:
    return [c for c in all_c if start_ms <= c.open_time_ms < end_ms]
