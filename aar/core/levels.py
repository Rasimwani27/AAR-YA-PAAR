"""Daily level grid from observation-session dojis."""

from __future__ import annotations

from datetime import date, time as dt_time

from aar.core.models import Candle, LevelSet
from aar.core.sessions import (
    in_observation,
    ist_to_utc_ms,
    ms_to_ist_date,
    ms_to_ist_time,
    OBSERVATION_START,
)


def _is_doji(c: Candle, tol: float) -> bool:
    return abs(c.close - c.open) <= tol


def _pick_dojis(
    obs: list[Candle],
    mid: float,
    tol: float,
    require_opposite_halves: bool,
) -> tuple[Candle | None, Candle | None]:
    upper: Candle | None = None
    lower: Candle | None = None
    for c in obs:
        if not _is_doji(c, tol):
            continue
        if require_opposite_halves:
            if c.close >= mid:
                if upper is None or c.close > upper.close or (
                    c.close == upper.close and c.open_time_ms > upper.open_time_ms
                ):
                    upper = c
            if c.close <= mid:
                if lower is None or c.close < lower.close or (
                    c.close == lower.close and c.open_time_ms > lower.open_time_ms
                ):
                    lower = c
        else:
            if c.close >= mid:
                if upper is None or c.close > upper.close:
                    upper = c
            if c.close <= mid:
                if lower is None or c.close < lower.close:
                    lower = c
    if upper is not None and lower is not None and upper.open_time_ms == lower.open_time_ms:
        return None, None
    return upper, lower


def _anchor_from_candles(
    day: date,
    anchor_candles: list[Candle],
    anchor_position: str,
) -> float | None:
    target_open = ist_to_utc_ms(day, OBSERVATION_START)
    for c in anchor_candles:
        if c.open_time_ms == target_open:
            return c.close
    for c in anchor_candles:
        d = ms_to_ist_date(c.open_time_ms)
        if d == day and ms_to_ist_time(c.open_time_ms) == OBSERVATION_START:
            return c.close
    if anchor_position == "pre_session":
        # 05:15-05:30 15m candle closes at 05:30
        pre = ist_to_utc_ms(day, dt_time(5, 15))
        for c in anchor_candles:
            if c.open_time_ms == pre:
                return c.close
    return None


def build_level_set(
    day: date,
    level_candles: list[Candle],
    anchor_candles: list[Candle],
    *,
    tick_size: float,
    doji_mode: str,
    doji_tol_ticks: int,
    adaptive_max_ticks: int,
    require_opposite_halves: bool,
    steps_per_side: int,
    include_midpoints: bool,
    min_spacing_ticks: int,
    anchor_position: str = "first_session",
    obs_candles: list[Candle] | None = None,
    anchor_price: float | None = None,
) -> LevelSet:
    if obs_candles is not None:
        obs = obs_candles
    else:
        obs = [c for c in level_candles if ms_to_ist_date(c.open_time_ms) == day and in_observation(c.open_time_ms)]
    if not obs:
        return LevelSet(str(day), 0.0, 0.0, [], False, "no_observation_candles")

    anchor = anchor_price if anchor_price is not None else _anchor_from_candles(day, anchor_candles, anchor_position)
    if anchor is None:
        return LevelSet(str(day), 0.0, 0.0, [], False, "missing_anchor")

    session_high = max(c.high for c in obs)
    session_low = min(c.low for c in obs)
    mid = (session_high + session_low) / 2.0

    tol_ticks_list: list[int]
    if doji_mode == "strict":
        tol_ticks_list = [0]
    elif doji_mode == "tick":
        tol_ticks_list = [doji_tol_ticks]
    elif doji_mode == "abs":
        tol_ticks_list = [doji_tol_ticks]
    elif doji_mode == "adaptive":
        tol_ticks_list = list(range(0, adaptive_max_ticks + 1))
    else:
        tol_ticks_list = list(range(0, adaptive_max_ticks + 1))

    pu, pl = None, None
    used_tol = 0.0
    for ticks in tol_ticks_list:
        if doji_mode == "abs" and ticks == doji_tol_ticks:
            tol = doji_tol_ticks * tick_size
        else:
            tol = ticks * tick_size
        pu, pl = _pick_dojis(obs, mid, tol, require_opposite_halves)
        if pu is not None and pl is not None:
            d = abs(pu.close - pl.close)
            if d >= min_spacing_ticks * tick_size:
                used_tol = tol
                break

    if pu is None or pl is None:
        return LevelSet(str(day), anchor, 0.0, [], False, "missing_doji")

    spacing_d = abs(pu.close - pl.close)
    if spacing_d < min_spacing_ticks * tick_size:
        return LevelSet(str(day), anchor, spacing_d, [], False, "d_too_small")

    levels: set[float] = {round(anchor, 8)}
    if include_midpoints:
        k_max = 2 * steps_per_side
        for k in range(-k_max, k_max + 1):
            levels.add(round(anchor + k * (spacing_d / 2.0), 8))
    else:
        for k in range(-steps_per_side, steps_per_side + 1):
            levels.add(round(anchor + k * spacing_d, 8))

    return LevelSet(
        str(day),
        anchor,
        spacing_d,
        sorted(levels),
        True,
        f"ok_tol={used_tol}",
    )
