"""Trailing stop: breakeven, last swing, previous swing."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from aar.core.models import Candle


@dataclass
class TrailingConfig:
    enabled: bool = False
    mode: str = "fixed"  # fixed | breakeven | last_low | prev_last_low | staged
    be_trigger_usd: float = 0.0  # 0 = use 1× initial stop distance
    be_offset_usd: float = 0.0
    trail_buffer_usd: float = 25.0
    max_trail_usd: float = 0.0  # 0 = no cap; min distance stop sits below last close (long)
    use_target: bool = True
    pivot_bars: int = 1  # bars on each side for swing pivot (1 = 3-bar fractal)
    swing_interval: str = "exec"  # exec | 15m — which bars define swing pivots


@dataclass
class TrailingState:
    initial_stop_dist: float
    stop_price: float
    swing_lows: list[float] = field(default_factory=list)
    swing_highs: list[float] = field(default_factory=list)
    be_armed: bool = False
    bars_in_trade: int = 0
    best_price: float = 0.0  # highest high (long) or lowest low (short)


def trailing_config_from_raw(raw: dict[str, Any] | None) -> TrailingConfig:
    if not raw:
        return TrailingConfig(enabled=False)
    return TrailingConfig(
        enabled=bool(raw.get("enabled", False)),
        mode=str(raw.get("mode", "fixed")),
        be_trigger_usd=float(raw.get("be_trigger_usd", 0.0)),
        be_offset_usd=float(raw.get("be_offset_usd", 0.0)),
        trail_buffer_usd=float(raw.get("trail_buffer_usd", 25.0)),
        max_trail_usd=float(raw.get("max_trail_usd", 0.0)),
        use_target=bool(raw.get("use_target", True)),
        pivot_bars=int(raw.get("pivot_bars", 1)),
        swing_interval=str(raw.get("swing_interval", "exec")),
    )


def init_trailing_state(side: str, entry: float, stop_dist: float) -> TrailingState:
    if side == "long":
        stop = entry - stop_dist
        return TrailingState(
            initial_stop_dist=stop_dist,
            stop_price=stop,
            best_price=entry,
        )
    stop = entry + stop_dist
    return TrailingState(
        initial_stop_dist=stop_dist,
        stop_price=stop,
        best_price=entry,
    )


def _pivot_low(window: list[Candle], pivot: int) -> bool:
    """True if center bar is lowest low in window."""
    mid = window[pivot]
    for i, c in enumerate(window):
        if i == pivot:
            continue
        if c.low <= mid.low:
            return False
    return True


def _pivot_high(window: list[Candle], pivot: int) -> bool:
    mid = window[pivot]
    for i, c in enumerate(window):
        if i == pivot:
            continue
        if c.high >= mid.high:
            return False
    return True


def register_swing(state: TrailingState, side: str, history: list[Candle], pivot_bars: int) -> None:
    """Call when a new bar completes; history includes the bar that just closed."""
    need = 2 * pivot_bars + 1
    if len(history) < need:
        return
    window = history[-need:]
    center = pivot_bars
    if side == "long" and _pivot_low(window, center):
        lv = window[center].low
        if not state.swing_lows or lv != state.swing_lows[-1]:
            state.swing_lows.append(lv)
    elif side == "short" and _pivot_high(window, center):
        hv = window[center].high
        if not state.swing_highs or hv != state.swing_highs[-1]:
            state.swing_highs.append(hv)


def _cap_trail_long(stop: float, reference_close: float, max_trail_usd: float) -> float:
    if max_trail_usd <= 0:
        return stop
    floor = reference_close - max_trail_usd
    return max(stop, floor)


def _cap_trail_short(stop: float, reference_close: float, max_trail_usd: float) -> float:
    if max_trail_usd <= 0:
        return stop
    ceiling = reference_close + max_trail_usd
    return min(stop, ceiling)


def _raise_stop_long(state: TrailingState, new_stop: float, ref_close: float, cfg: TrailingConfig) -> None:
    new_stop = _cap_trail_long(new_stop, ref_close, cfg.max_trail_usd)
    if new_stop > state.stop_price:
        state.stop_price = new_stop


def _lower_stop_short(state: TrailingState, new_stop: float, ref_close: float, cfg: TrailingConfig) -> None:
    new_stop = _cap_trail_short(new_stop, ref_close, cfg.max_trail_usd)
    if new_stop < state.stop_price:
        state.stop_price = new_stop


def update_trailing(
    state: TrailingState,
    side: str,
    entry: float,
    c: Candle,
    cfg: TrailingConfig,
) -> None:
    state.bars_in_trade += 1
    if side == "long":
        state.best_price = max(state.best_price, c.high)
        fav = state.best_price - entry
    else:
        state.best_price = min(state.best_price, c.low)
        fav = entry - state.best_price

    be_trig = cfg.be_trigger_usd if cfg.be_trigger_usd > 0 else state.initial_stop_dist
    mode = cfg.mode

    if mode == "fixed":
        return

    if fav >= be_trig and not state.be_armed:
        state.be_armed = True

    if mode == "breakeven":
        if state.be_armed:
            be = entry + cfg.be_offset_usd if side == "long" else entry - cfg.be_offset_usd
            if side == "long":
                _raise_stop_long(state, be, c.close, cfg)
            else:
                _lower_stop_short(state, be, c.close, cfg)
        return

    ref_low = None
    ref_high = None
    if side == "long" and state.swing_lows:
        if mode == "last_low":
            ref_low = state.swing_lows[-1]
        elif mode in ("prev_last_low", "staged"):
            ref_low = state.swing_lows[-2] if len(state.swing_lows) >= 2 else state.swing_lows[-1]
    if side == "short" and state.swing_highs:
        if mode == "last_low":
            ref_high = state.swing_highs[-1]
        elif mode in ("prev_last_low", "staged"):
            ref_high = state.swing_highs[-2] if len(state.swing_highs) >= 2 else state.swing_highs[-1]

    if mode == "last_low" and state.be_armed:
        if side == "long":
            _raise_stop_long(state, entry + cfg.be_offset_usd, c.close, cfg)
            if ref_low is not None:
                _raise_stop_long(state, ref_low - cfg.trail_buffer_usd, c.close, cfg)
        elif side == "short":
            _lower_stop_short(state, entry - cfg.be_offset_usd, c.close, cfg)
            if ref_high is not None:
                _lower_stop_short(state, ref_high + cfg.trail_buffer_usd, c.close, cfg)
        return

    if mode in ("prev_last_low", "staged") and state.be_armed:
        if side == "long" and ref_low is not None:
            trail = ref_low - cfg.trail_buffer_usd
            if mode == "staged":
                be = entry + cfg.be_offset_usd
                trail = max(trail, be)
            _raise_stop_long(state, trail, c.close, cfg)
        elif side == "short" and ref_high is not None:
            trail = ref_high + cfg.trail_buffer_usd
            if mode == "staged":
                be = entry - cfg.be_offset_usd
                trail = min(trail, be)
            _lower_stop_short(state, trail, c.close, cfg)


def check_exit_trailing(
    side: str,
    entry: float,
    state: TrailingState,
    c: Candle,
    target_dist: float,
    cfg: TrailingConfig,
) -> tuple[float, str] | None:
    if side == "long":
        if c.low <= state.stop_price:
            return state.stop_price, "trail_stop" if cfg.enabled and cfg.mode != "fixed" else "stop"
        if cfg.use_target and target_dist > 0 and c.high >= entry + target_dist:
            return entry + target_dist, "target"
    else:
        if c.high >= state.stop_price:
            return state.stop_price, "trail_stop" if cfg.enabled and cfg.mode != "fixed" else "stop"
        if cfg.use_target and target_dist > 0 and c.low <= entry - target_dist:
            return entry - target_dist, "target"
    return None
