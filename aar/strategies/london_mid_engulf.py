"""London session: x vs y range bias, trade midpoint with EMA9 + engulfing."""

from __future__ import annotations

from aar.config import AppConfig
from aar.core.models import Candle, LevelSet, Signal
from aar.core.rules import Strategy, register
from aar.core.sessions import (
    in_london,
    in_observation,
    london_candle_index,
    london_minutes_from_open,
    ms_to_ist_date,
    ms_to_ist_time,
)
from aar.reversal.candle_patterns import best_pattern_for_reversal
from aar.strategies.break_fade import ema


@register("london-mid-engulf")
class LondonMidEngulfStrategy(Strategy):
    def __init__(self, cfg: AppConfig) -> None:
        self.p = cfg.raw["strategy"]["london_mid_engulf"]
        self.risk = cfg.raw.get("risk", {})
        self.market = cfg.raw["market"]
        self._levels: LevelSet | None = None
        self._day = None
        self._trades_today = 0
        self._obs_hi = 0.0
        self._obs_lo = 1e18
        self._obs_ready = False
        self._lon_hi = 0.0
        self._lon_lo = 1e18
        self._x_range = 0.0
        self._prev_london_y = 0.0
        self._day_bias: str | None = None
        self._ema_closes: list[float] = []
        self._ema9 = 0.0
        self._prev: Candle | None = None
        self._pattern_whitelist = {str(x) for x in self.p.get("pattern_whitelist", [])}
        self._require_strict = bool(self.p.get("require_strict_pattern", False))
        self._inverse = bool(self.p.get("inverse", False))

    def _exec_side(self, bias: str) -> str:
        if self._inverse:
            return "short" if bias == "long" else "long"
        return bias

    def risk_pct(self) -> float:
        return float(self.p.get("risk_pct", 2.0))

    def compound(self) -> bool:
        return bool(self.p.get("compound", True))

    def on_day_levels(self, levels: LevelSet | None) -> None:
        self._levels = levels
        self._trades_today = 0
        self._obs_hi = 0.0
        self._obs_lo = 1e18
        self._obs_ready = False
        self._lon_hi = 0.0
        self._lon_lo = 1e18
        self._x_range = 0.0
        self._day_bias = None
        if self._lon_lo < self._lon_hi:
            self._prev_london_y = self._lon_hi - self._lon_lo
        self._ema_closes = []
        self._ema9 = 0.0
        self._prev = None

    def _maybe_lock_bias(self) -> None:
        """x = observation range; y = today's London range (or prior day until London builds)."""
        if self._day_bias is not None or self._x_range <= 0:
            return
        y_live = self._lon_hi - self._lon_lo
        y = y_live if y_live >= float(self.p.get("min_london_range_usd", 100)) else self._prev_london_y
        if y <= 0:
            return
        if self._x_range > y:
            self._day_bias = "long"
        elif self._x_range < y:
            self._day_bias = "short"

    def _mid(self) -> float | None:
        if self._lon_lo > self._lon_hi:
            return None
        return (self._lon_hi + self._lon_lo) / 2.0

    def _crosses_mid(self, prev: Candle | None, c: Candle, mid: float) -> bool:
        tol = float(self.p.get("mid_touch_tol_ticks", 5)) * float(self.market["tick_size"])
        if prev is None:
            return False
        if not (c.low - tol <= mid <= c.high + tol):
            return False
        # Rejection: prior close on one side, current interacts with mid
        if prev.close > mid + tol and c.low <= mid + tol:
            return True
        if prev.close < mid - tol and c.high >= mid - tol:
            return True
        return abs(c.close - mid) <= tol * 2

    def _pattern_confirms(self, side: str, prev: Candle | None, c: Candle) -> bool:
        kind = "swing_low" if side == "long" else "swing_high"
        hit = best_pattern_for_reversal(prev, c, kind)
        if hit is None:
            return False
        want = "bullish_reversal" if side == "long" else "bearish_reversal"
        if self._pattern_whitelist and hit.name not in self._pattern_whitelist:
            return False
        if hit.family != want and hit.family != "neutral_reversal":
            return False
        if self._require_strict and not hit.strict:
            return False
        return True

    def feed_ema_bar(self, close: float) -> None:
        period = int(self.p.get("ema_period", 9))
        self._ema_closes.append(close)
        if len(self._ema_closes) >= period:
            self._ema9 = ema(self._ema_closes, period)[-1]

    def on_candle(self, candle: Candle, *, in_trading_window: bool) -> Signal | None:
        ms = candle.open_time_ms
        day = ms_to_ist_date(ms)
        if day != self._day:
            self._day = day

        if in_observation(ms):
            self._obs_hi = max(self._obs_hi, candle.high)
            self._obs_lo = min(self._obs_lo, candle.low)
            self._prev = candle
            return None

        if not in_observation(ms) and not self._obs_ready and self._obs_lo < self._obs_hi:
            self._x_range = self._obs_hi - self._obs_lo
            self._obs_ready = True

        if in_london(ms):
            self._lon_hi = max(self._lon_hi, candle.high)
            self._lon_lo = min(self._lon_lo, candle.low)
            self._maybe_lock_bias()

        if not in_london(ms):
            self._prev = candle
            return None

        if not in_trading_window:
            self._prev = candle
            return None

        if self._levels is None or not self._levels.valid:
            self._prev = candle
            return None

        max_trades = int(self.risk.get("max_trades_per_day", 1))
        if self._trades_today >= max_trades:
            self._prev = candle
            return None

        entry_day = ms_to_ist_date(ms)
        skip_wd = self.p.get("skip_entry_weekdays", [])
        if skip_wd and entry_day.weekday() in {int(x) for x in skip_wd}:
            self._prev = candle
            return None

        skip_hours = self.p.get("skip_entry_hours_ist", [])
        if skip_hours and ms_to_ist_time(ms).hour in {int(h) for h in skip_hours}:
            self._prev = candle
            return None

        lon_min = london_minutes_from_open(ms)
        skip_before = self.p.get("skip_london_minutes_before")
        if skip_before is not None and lon_min >= 0 and lon_min < int(skip_before):
            self._prev = candle
            return None
        skip_after = self.p.get("skip_london_minutes_after")
        if skip_after is not None and lon_min >= 0 and lon_min > int(skip_after):
            self._prev = candle
            return None
        for pair in self.p.get("skip_london_minute_ranges", []):
            lo, hi = int(pair[0]), int(pair[1])
            if lon_min >= 0 and lo <= lon_min < hi:
                self._prev = candle
                return None

        skip_months = self.p.get("skip_entry_months", [])
        if skip_months and entry_day.month in {int(m) for m in skip_months}:
            self._prev = candle
            return None

        skip = int(self.p.get("skip_first_candles", 1))
        if london_candle_index(ms, int(self.market["interval"][:-1])) < skip:
            self._prev = candle
            return None

        self.feed_ema_bar(candle.close)
        period = int(self.p.get("ema_period", 9))
        if len(self._ema_closes) < period:
            self._prev = candle
            return None

        bias = self._day_bias
        mid = self._mid()
        if bias is None or mid is None:
            self._prev = candle
            return None

        if not self._crosses_mid(self._prev, candle, mid):
            self._prev = candle
            return None

        if not self._pattern_confirms(bias, self._prev, candle):
            self._prev = candle
            return None

        if bias == "long" and candle.close <= self._ema9:
            self._prev = candle
            return None
        if bias == "short" and candle.close >= self._ema9:
            self._prev = candle
            return None

        stop = float(self.p["stop_usdt"])
        rr = float(self.p.get("reward_risk", 4.0))
        if self.p.get("use_reward_risk_for_target", True):
            target = stop * rr
        else:
            target = float(self.p.get("target_usdt", stop * rr))

        prev_bar = self._prev
        self._trades_today += 1
        self._prev = candle
        pat = best_pattern_for_reversal(
            prev_bar,
            candle,
            "swing_low" if bias == "long" else "swing_high",
        )
        pname = pat.name if pat else "?"
        side = self._exec_side(bias)
        inv_tag = " inv" if self._inverse else ""
        return Signal(
            side=side,
            entry_price=candle.close,
            stop_dist=stop,
            target_dist=target,
            reason=f"london_mid{inv_tag} bias={bias} x={self._x_range:.0f} y_prev={self._prev_london_y:.0f} mid={mid:.1f} {pname}",
            max_hold_bars=int(self.p.get("max_hold_bars", 0)) or None,
        )
