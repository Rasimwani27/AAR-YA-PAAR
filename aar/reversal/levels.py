"""Swing high/low reversal levels from OHLC series."""

from __future__ import annotations

from dataclasses import dataclass

from aar.core.models import Candle


@dataclass(frozen=True, slots=True)
class ReversalLevel:
    symbol: str
    interval_min: int
    trading_date_ist: str
    kind: str  # swing_high | swing_low
    price: float
    candle_open_ms: int
    left_bars: int
    right_bars: int


def detect_swing_reversals(
    candles: list[Candle],
    *,
    symbol: str,
    interval_min: int,
    trading_date_ist: str,
    left: int = 2,
    right: int = 2,
) -> list[ReversalLevel]:
    """Fractal pivots: high/low must exceed `left` prior and `right` following bars."""
    if len(candles) < left + right + 1:
        return []
    out: list[ReversalLevel] = []
    for i in range(left, len(candles) - right):
        c = candles[i]
        hi = c.high
        lo = c.low
        is_high = all(hi > candles[i - j].high for j in range(1, left + 1)) and all(
            hi >= candles[i + j].high for j in range(1, right + 1)
        ) and any(hi > candles[i + j].high for j in range(1, right + 1))
        is_low = all(lo < candles[i - j].low for j in range(1, left + 1)) and all(
            lo <= candles[i + j].low for j in range(1, right + 1)
        ) and any(lo < candles[i + j].low for j in range(1, right + 1))
        if is_high:
            out.append(
                ReversalLevel(
                    symbol, interval_min, trading_date_ist, "swing_high", hi, c.open_time_ms, left, right
                )
            )
        if is_low:
            out.append(
                ReversalLevel(
                    symbol, interval_min, trading_date_ist, "swing_low", lo, c.open_time_ms, left, right
                )
            )
    return out


def resample_candles(candles_1m: list[Candle], interval_min: int) -> list[Candle]:
    if interval_min <= 1:
        return list(candles_1m)
    bucket_ms = interval_min * 60_000
    buckets: dict[int, list[Candle]] = {}
    for c in candles_1m:
        key = (c.open_time_ms // bucket_ms) * bucket_ms
        buckets.setdefault(key, []).append(c)
    out: list[Candle] = []
    for key in sorted(buckets):
        chunk = buckets[key]
        o = chunk[0].open
        h = max(x.high for x in chunk)
        l = min(x.low for x in chunk)
        cl = chunk[-1].close
        v = sum(x.volume for x in chunk)
        ct = chunk[-1].close_time_ms or chunk[-1].open_time_ms
        out.append(Candle(key, o, h, l, cl, v, ct))
    return out
