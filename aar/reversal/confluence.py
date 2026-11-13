"""Level / structure confluences at intraday reversal pivots (5m-oriented heuristics)."""

from __future__ import annotations

from dataclasses import dataclass, field

from aar.core.models import Candle

FIB_RATIOS = (0.382, 0.5, 0.618, 0.786)


@dataclass
class ConfluenceFlags:
    liquidity_sweep: bool = False
    sl_hunting: bool = False
    fib_retrace: bool = False
    volume_spike: bool = False
    order_block: bool = False
    fvg: bool = False

    def active_names(self) -> list[str]:
        out: list[str] = []
        for name in (
            "liquidity_sweep",
            "sl_hunting",
            "fib_retrace",
            "volume_spike",
            "order_block",
            "fvg",
        ):
            if getattr(self, name):
                out.append(name)
        return out


def _avg_range(candles: list[Candle], end: int, n: int = 20) -> float:
    start = max(0, end - n)
    chunk = candles[start:end]
    if not chunk:
        return 1.0
    return sum(c.high - c.low for c in chunk) / len(chunk)


def _avg_volume(candles: list[Candle], end: int, n: int = 20) -> float:
    start = max(0, end - n)
    chunk = candles[start:end]
    if not chunk:
        return 1.0
    return sum(c.volume for c in chunk) / len(chunk)


def _near(price: float, level: float, tol_usd: float) -> bool:
    return abs(price - level) <= tol_usd


def liquidity_sweep(
    candles: list[Candle],
    idx: int,
    kind: str,
    *,
    lookback: int = 48,
    pierce_usd: float = 15.0,
) -> bool:
    """Wick through prior range extreme, close back inside (stop-run)."""
    if idx < 3:
        return False
    start = max(0, idx - lookback)
    window = candles[start:idx]
    if len(window) < 5:
        return False
    c = candles[idx]
    tol = pierce_usd
    if kind == "swing_low":
        pool = min(x.low for x in window)
        return c.low < pool - tol and c.close > pool
    pool = max(x.high for x in window)
    return c.high > pool + tol and c.close < pool


def sl_hunting(
    candles: list[Candle],
    idx: int,
    kind: str,
    *,
    lookback: int = 48,
    equal_tol_usd: float = 25.0,
    min_touches: int = 2,
    pierce_usd: float = 10.0,
) -> bool:
    """Equal highs/lows pool then wick sweep + close back."""
    if idx < 3:
        return False
    start = max(0, idx - lookback)
    window = candles[start:idx]
    if len(window) < min_touches + 2:
        return False
    c = candles[idx]

    if kind == "swing_low":
        lows = [x.low for x in window]
        lows.sort()
        clusters: list[list[float]] = []
        for lo in lows:
            if not clusters or lo - clusters[-1][0] > equal_tol_usd:
                clusters.append([lo])
            else:
                clusters[-1].append(lo)
        pools = [min(cl) for cl in clusters if len(cl) >= min_touches]
        if not pools:
            return False
        pool = min(pools)
        return c.low < pool - pierce_usd and c.close > pool

    highs = [x.high for x in window]
    highs.sort(reverse=True)
    clusters = []
    for hi in highs:
        if not clusters or clusters[-1][0] - hi > equal_tol_usd:
            clusters.append([hi])
        else:
            clusters[-1].append(hi)
    pools = [max(cl) for cl in clusters if len(cl) >= min_touches]
    if not pools:
        return False
    pool = max(pools)
    return c.high > pool + pierce_usd and c.close < pool


def fib_retrace_session(
    candles: list[Candle],
    idx: int,
    kind: str,
    session_start_idx: int,
) -> bool:
    """Pivot near 38.2–78.6% retrace of current session range."""
    if idx <= session_start_idx + 3:
        return False
    seg = candles[session_start_idx : idx + 1]
    hi = max(c.high for c in seg)
    lo = min(c.low for c in seg)
    rng = hi - lo
    if rng < 80:
        return False
    pivot = candles[idx].low if kind == "swing_low" else candles[idx].high
    tol = max(35.0, rng * 0.06)
    if kind == "swing_low":
        # Down from session high toward low — measure retrace from bottom
        for r in FIB_RATIOS:
            level = lo + r * rng
            if _near(pivot, level, tol):
                return True
        return False
    for r in FIB_RATIOS:
        level = hi - r * rng
        if _near(pivot, level, tol):
            return True
    return False


def volume_spike(candles: list[Candle], idx: int, *, mult: float = 1.45, period: int = 20) -> bool:
    if idx < period:
        return False
    base = _avg_volume(candles, idx, period)
    if base <= 0:
        return False
    return candles[idx].volume >= base * mult


def order_block_touch(
    candles: list[Candle],
    idx: int,
    kind: str,
    *,
    lookback: int = 60,
) -> bool:
    """Last opposing candle before displacement; pivot wicks into its body zone."""
    if idx < 8:
        return False
    atr = _avg_range(candles, idx, 20)
    start = max(0, idx - lookback)
    c = candles[idx]

    if kind == "swing_low":
        for j in range(idx - 3, start, -1):
            if candles[j].close >= candles[j].open:
                continue
            # displacement up within 4 bars
            fwd = candles[j + 1 : min(len(candles), j + 5)]
            if len(fwd) < 2:
                continue
            rise = max(x.high for x in fwd) - candles[j].close
            if rise < 1.25 * atr:
                continue
            z_lo = min(candles[j].open, candles[j].close)
            z_hi = max(candles[j].open, candles[j].close)
            pad = atr * 0.15
            if c.low <= z_hi + pad and c.low >= z_lo - pad:
                return True
        return False

    for j in range(idx - 3, start, -1):
        if candles[j].close <= candles[j].open:
            continue
        fwd = candles[j + 1 : min(len(candles), j + 5)]
        if len(fwd) < 2:
            continue
        drop = candles[j].close - min(x.low for x in fwd)
        if drop < 1.25 * atr:
            continue
        z_lo = min(candles[j].open, candles[j].close)
        z_hi = max(candles[j].open, candles[j].close)
        pad = atr * 0.15
        if c.high >= z_lo - pad and c.high <= z_hi + pad:
            return True
    return False


def fvg_touch(
    candles: list[Candle],
    idx: int,
    kind: str,
    *,
    lookback: int = 96,
    pad_usd: float = 25.0,
) -> bool:
    """Pivot reacts into a recent 3-candle FVG zone (within lookback)."""
    if idx < 3:
        return False
    start = max(2, idx - lookback)
    pivot = candles[idx]
    pivot_lo, pivot_hi = pivot.low, pivot.high
    body_lo = min(pivot.open, pivot.close)
    body_hi = max(pivot.open, pivot.close)

    if kind == "swing_low":
        for k in range(start, idx + 1):
            if k < 2:
                continue
            gap_lo = candles[k - 2].high
            gap_hi = candles[k].low
            if gap_hi <= gap_lo:
                continue
            zone_lo, zone_hi = gap_lo - pad_usd, gap_hi + pad_usd
            if pivot_lo <= zone_hi and body_lo >= zone_lo - pad_usd:
                return True
        return False

    for k in range(start, idx + 1):
        if k < 2:
            continue
        gap_lo = candles[k].high
        gap_hi = candles[k - 2].low
        if gap_hi <= gap_lo:
            continue
        zone_lo, zone_hi = gap_lo - pad_usd, gap_hi + pad_usd
        if pivot_hi >= zone_lo and body_hi <= zone_hi + pad_usd:
            return True
    return False


def evaluate_confluence(
    candles: list[Candle],
    idx: int,
    kind: str,
    session_start_idx: int,
) -> ConfluenceFlags:
    return ConfluenceFlags(
        liquidity_sweep=liquidity_sweep(candles, idx, kind),
        sl_hunting=sl_hunting(candles, idx, kind),
        fib_retrace=fib_retrace_session(candles, idx, kind, session_start_idx),
        volume_spike=volume_spike(candles, idx),
        order_block=order_block_touch(candles, idx, kind),
        fvg=fvg_touch(candles, idx, kind),
    )
