"""Classic single- and two-bar reversal candlestick labels."""

from __future__ import annotations

from dataclasses import dataclass

from aar.core.models import Candle


def _body(c: Candle) -> float:
    return abs(c.close - c.open)


def _range(c: Candle) -> float:
    return max(c.high - c.low, 1e-9)


def _upper_wick(c: Candle) -> float:
    return c.high - max(c.open, c.close)


def _lower_wick(c: Candle) -> float:
    return min(c.open, c.close) - c.low


def _is_bull(c: Candle) -> bool:
    return c.close > c.open


def _is_bear(c: Candle) -> bool:
    return c.close < c.open


@dataclass(frozen=True)
class PatternHit:
    name: str
    family: str  # bullish_reversal | bearish_reversal | neutral_reversal
    strict: bool  # True = textbook; False = "close" heuristic


def single_bar_patterns(c: Candle, *, at_swing_low: bool, at_swing_high: bool) -> list[PatternHit]:
    """Patterns on the pivot bar."""
    hits: list[PatternHit] = []
    body = _body(c)
    rng = _range(c)
    uw = _upper_wick(c)
    lw = _lower_wick(c)
    body_ratio = body / rng
    small_body = body_ratio <= 0.35
    tiny_body = body_ratio <= 0.12

    # Doji family
    if tiny_body:
        if lw > 2 * body and uw <= body * 1.5:
            hits.append(PatternHit("dragonfly_doji", "bullish_reversal", True))
        elif uw > 2 * body and lw <= body * 1.5:
            hits.append(PatternHit("gravestone_doji", "bearish_reversal", True))
        else:
            hits.append(PatternHit("doji", "neutral_reversal", True))

    # Hammer / shooting star (strict)
    if lw >= 2 * body and uw <= body * 0.8 and body_ratio <= 0.4:
        hits.append(PatternHit("hammer", "bullish_reversal", True))
    if uw >= 2 * body and lw <= body * 0.8 and body_ratio <= 0.4:
        hits.append(PatternHit("shooting_star", "bearish_reversal", True))

    # Close / heuristic wick reversals
    if lw >= 1.5 * body and lw / rng >= 0.45:
        hits.append(PatternHit("long_lower_wick", "bullish_reversal", False))
    if uw >= 1.5 * body and uw / rng >= 0.45:
        hits.append(PatternHit("long_upper_wick", "bearish_reversal", False))

    if small_body and not tiny_body:
        hits.append(PatternHit("small_body_spinning_top", "neutral_reversal", False))

    # Contextual names at pivot
    if at_swing_low and _is_bull(c) and body_ratio >= 0.5:
        hits.append(PatternHit("bullish_marubozu_at_low", "bullish_reversal", False))
    if at_swing_high and _is_bear(c) and body_ratio >= 0.5:
        hits.append(PatternHit("bearish_marubozu_at_high", "bearish_reversal", False))

    return hits


def two_bar_patterns(prev: Candle | None, c: Candle, *, at_swing_low: bool, at_swing_high: bool) -> list[PatternHit]:
    if prev is None:
        return []
    hits: list[PatternHit] = []
    # Engulfing (body engulf)
    pb, cb = _body(prev), _body(c)
    if pb > 0 and cb > pb:
        if _is_bear(prev) and _is_bull(c) and c.open <= prev.close and c.close >= prev.open:
            hits.append(PatternHit("bullish_engulfing", "bullish_reversal", True))
        if _is_bull(prev) and _is_bear(c) and c.open >= prev.close and c.close <= prev.open:
            hits.append(PatternHit("bearish_engulfing", "bearish_reversal", True))

    # Harami (close)
    if cb < pb * 0.6:
        if _is_bear(prev) and _is_bull(c):
            hits.append(PatternHit("bullish_harami", "bullish_reversal", False))
        if _is_bull(prev) and _is_bear(c):
            hits.append(PatternHit("bearish_harami", "bearish_reversal", False))

    # Piercing / dark cloud (close)
    mid_prev = (prev.open + prev.close) / 2
    if _is_bear(prev) and _is_bull(c) and c.open < prev.low and c.close > mid_prev and c.close < prev.open:
        hits.append(PatternHit("piercing_line", "bullish_reversal", False))
    if _is_bull(prev) and _is_bear(c) and c.open > prev.high and c.close < mid_prev and c.close > prev.open:
        hits.append(PatternHit("dark_cloud_cover", "bearish_reversal", False))

    return hits


def best_pattern_for_reversal(
    prev: Candle | None,
    c: Candle,
    kind: str,
) -> PatternHit | None:
    """Pick one best matching pattern aligned with swing type."""
    low = kind == "swing_low"
    high = kind == "swing_high"
    all_hits = single_bar_patterns(c, at_swing_low=low, at_swing_high=high)
    all_hits.extend(two_bar_patterns(prev, c, at_swing_low=low, at_swing_high=high))

    if not all_hits:
        return None

    want = "bullish_reversal" if low else "bearish_reversal"

    def score(p: PatternHit) -> tuple[int, int]:
        aligned = 1 if p.family == want else (0 if p.family == "neutral_reversal" else -1)
        strict = 1 if p.strict else 0
        return (aligned, strict)

    all_hits.sort(key=score, reverse=True)
    top = all_hits[0]
    if top.family == want or top.family == "neutral_reversal":
        return top
    # allow weak bearish label at low only if nothing bullish
    for p in all_hits:
        if p.family == want or p.family == "neutral_reversal":
            return p
    return top
