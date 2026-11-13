"""7-step break-fade against the daily level grid."""

from __future__ import annotations

from aar.config import AppConfig
from aar.core.levels import build_level_set
from aar.core.models import Candle, LevelSet, Signal
from aar.core.rules import Strategy
from aar.core.sessions import (
    in_london,
    in_new_york,
    london_candle_index,
    ms_to_ist_date,
    new_york_candle_index,
)


def ema(values: list[float], period: int) -> list[float]:
    if not values:
        return []
    k = 2.0 / (period + 1)
    out = [values[0]]
    for v in values[1:]:
        out.append(v * k + out[-1] * (1 - k))
    return out


def _ema_cross(c: Candle, ema_val: float, bullish: bool) -> bool:
    if bullish:
        return c.open < ema_val <= c.close
    return c.open > ema_val >= c.close


def _break_level(c: Candle, level: float, tol: float, bullish: bool) -> bool:
    if bullish:
        return c.open < level + tol and c.close >= level
    return c.open > level - tol and c.close <= level


class BreakFadeStrategy(Strategy):
    def __init__(self, cfg: AppConfig) -> None:
        self.cfg = cfg
        self.p = cfg.raw["strategy"]["break_fade"]
        self.level_cfg = cfg.raw["levels"]
        self.market = cfg.raw["market"]
        self.risk = cfg.raw["risk"]
        self._levels: LevelSet | None = None
        self._active_levels: list[float] = []
        self._ema_closes: list[float] = []
        self._last_ema: float = 0.0
        self._pending_break: tuple[Candle, float, bool] | None = None
        self._trades_today = 0
        self._current_day = None
        self._exec_interval_min = int(cfg.interval[:-1])
        self._analysis_session = str(self.p.get("analysis_session", "london")).lower()
        self._execution_session = str(self.p.get("execution_session", "london")).lower()
        self._daily_closes: list[tuple[int, float]] = []
        raw_regime = self.p.get("regime_min_return_30d")
        self._regime_min_return_30d = float(raw_regime) if raw_regime is not None else None

    def set_daily_closes(self, candles: list[Candle]) -> None:
        self._daily_closes = sorted((c.open_time_ms, c.close) for c in candles)

    def _return_30d(self, ms: int) -> float | None:
        if not self._daily_closes:
            return None
        target_ms = ms - 30 * 86_400_000
        past_close: float | None = None
        current_close: float | None = None
        for t, close in self._daily_closes:
            if t <= target_ms:
                past_close = close
            if t <= ms:
                current_close = close
            elif t > ms:
                break
        if past_close is None or current_close is None or past_close <= 0:
            return None
        return (current_close - past_close) / past_close

    def _passes_regime(self, ms: int) -> bool:
        if self._regime_min_return_30d is None:
            return True
        ret = self._return_30d(ms)
        if ret is None:
            return True
        return ret >= self._regime_min_return_30d

    def _in_analysis(self, ms: int) -> bool:
        if self._analysis_session == "new_york":
            return in_new_york(ms)
        return in_london(ms)

    def _in_execution(self, ms: int) -> bool:
        if self._execution_session == "new_york":
            return in_new_york(ms)
        return in_london(ms)

    def _exec_candle_index(self, ms: int) -> int:
        if self._execution_session == "new_york":
            return new_york_candle_index(ms, self._exec_interval_min)
        return london_candle_index(ms, self._exec_interval_min)

    def risk_pct(self) -> float:
        return float(self.p.get("risk_pct", 1.5))

    def compound(self) -> bool:
        return bool(self.p.get("compound", True))

    def on_day_levels(self, levels: LevelSet | None) -> None:
        self._levels = levels
        self._pending_break = None
        self._trades_today = 0
        if levels and levels.valid:
            kinds = self.p.get("level_kinds", "all")
            if kinds == "anchor":
                self._active_levels = [levels.anchor]
            elif kinds == "full":
                self._active_levels = [lv for lv in levels.levels if lv != levels.anchor]
            else:
                self._active_levels = list(levels.levels)
        else:
            self._active_levels = []

    def feed_ema_bar(self, close: float) -> None:
        self._ema_closes.append(close)
        period = int(self.p.get("ema_period", 3))
        if len(self._ema_closes) >= period:
            self._last_ema = ema(self._ema_closes, period)[-1]

    def on_candle_analysis(self, candle: Candle) -> None:
        """London (or analysis session): detect breaks only — no entries."""
        if not self._active_levels or not self._in_analysis(candle.open_time_ms):
            return
        self._scan_break_setup(candle)

    def on_candle(self, candle: Candle, *, in_trading_window: bool) -> Signal | None:
        day = ms_to_ist_date(candle.open_time_ms)
        if self._current_day != day:
            self._current_day = day
            self._trades_today = 0

        if not self._active_levels:
            return None

        ms = candle.open_time_ms
        split = self._analysis_session != self._execution_session

        if split and self._in_analysis(ms):
            self._scan_break_setup(candle)

        if not in_trading_window or not self._in_execution(ms):
            return None

        max_trades = int(self.risk.get("max_trades_per_day", 1))
        if self._trades_today >= max_trades:
            return None

        skip = int(self.p.get("skip_first_candles", 0))
        idx = self._exec_candle_index(ms)
        if idx < skip:
            return None

        entry_day = ms_to_ist_date(ms)
        skip_weekdays = self.p.get("skip_entry_weekdays", [])
        if skip_weekdays and entry_day.weekday() in {int(x) for x in skip_weekdays}:
            return None
        skip_years = self.p.get("skip_entry_years", [])
        if skip_years and entry_day.year in {int(y) for y in skip_years}:
            return None
        skip_months = self.p.get("skip_entry_months", [])
        if skip_months and entry_day.month in {int(m) for m in skip_months}:
            return None
        if not self._passes_regime(ms):
            return None

        sig = self._try_entry_from_pending(candle)
        if sig is not None:
            return sig

        if not split:
            self._scan_break_setup(candle)

        return None

    def _scan_break_setup(self, candle: Candle) -> None:
        tol = float(self.p.get("level_cross_tol_ticks", 0)) * float(self.market["tick_size"])
        ema_val = self._last_ema
        for level in self._active_levels:
            for bull in (True, False):
                if not _break_level(candle, level, tol, bull):
                    continue
                if candle.is_flat:
                    continue
                if bull and not candle.is_green:
                    continue
                if not bull and not candle.is_red:
                    continue
                if ema_val and not _ema_cross(candle, ema_val, bull):
                    continue
                self._pending_break = (candle, level, bull)
                return

    def _try_entry_from_pending(self, candle: Candle) -> Signal | None:
        if self._pending_break is None:
            return None
        _brk, level, bull_break = self._pending_break
        self._pending_break = None
        opposite_ok = (bull_break and candle.is_red) or (not bull_break and candle.is_green)
        if not opposite_ok or candle.is_flat:
            return None
        stop = float(self.p["stop_usdt"])
        target = float(self.p["target_usdt"])
        side = "short" if bull_break else "long"
        self._trades_today += 1
        return Signal(
            side=side,
            entry_price=candle.close,
            stop_dist=stop,
            target_dist=target,
            reason=f"fade_break level={level:.2f}",
        )


def build_levels_for_day(
    cfg: AppConfig,
    day,
    level_candles,
    anchor_candles,
    *,
    obs_candles: list | None = None,
    anchor_price: float | None = None,
) -> LevelSet:
    lc = cfg.raw["levels"]
    return build_level_set(
        day,
        level_candles,
        anchor_candles,
        tick_size=cfg.tick_size,
        doji_mode=lc.get("doji_mode", "adaptive"),
        doji_tol_ticks=int(lc.get("doji_tol_ticks", 10)),
        adaptive_max_ticks=int(lc.get("adaptive_max_ticks", 50)),
        require_opposite_halves=bool(lc.get("require_opposite_halves", True)),
        steps_per_side=int(lc.get("steps_per_side", 12)),
        include_midpoints=bool(lc.get("include_midpoints", False)),
        min_spacing_ticks=int(lc.get("min_spacing_ticks", 1)),
        anchor_position=cfg.anchor_position,
        obs_candles=obs_candles,
        anchor_price=anchor_price,
    )
