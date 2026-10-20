"""Break-fade (London 15m anchor setup) + NY 3m reversal candle confirmation."""

from __future__ import annotations

from collections import deque

from aar.config import AppConfig
from aar.core.models import Candle, LevelSet, Signal
from aar.core.rules import Strategy, register
from aar.core.sessions import (
    in_london,
    in_new_york,
    ms_to_ist_date,
    new_york_candle_index,
)
from aar.reversal.candle_patterns import best_pattern_for_reversal
from aar.strategies.break_fade import (
    BreakFadeStrategy,
    _break_level,
    _ema_cross,
    ema,
)


@register("fade-reversal")
class FadeReversalStrategy(Strategy):
    def __init__(self, cfg: AppConfig) -> None:
        self.cfg = cfg
        self.p = cfg.raw["strategy"]["fade_reversal"]
        self.market = cfg.raw["market"]
        self.risk = cfg.raw["risk"]
        self._bf = BreakFadeStrategy(self._as_break_fade_cfg(cfg))
        self._3m_buf: deque[Candle] = deque(maxlen=12)
        self._pattern_whitelist = {str(x) for x in self.p.get("pattern_whitelist", [])}
        self._require_strict = bool(self.p.get("require_strict_pattern", True))
        self._trend_interval = str(self.p.get("trend_interval", "") or "")
        self._trend_ema_period = int(self.p.get("trend_ema_period", 50))
        self._trend_closes: list[float] = []
        self._trend_ema: float = 0.0
        self._last_trend_close: float = 0.0

    @staticmethod
    def _as_break_fade_cfg(cfg: AppConfig) -> AppConfig:
        raw = dict(cfg.raw)
        raw["strategy"] = dict(raw["strategy"])
        raw["strategy"]["break_fade"] = raw["strategy"]["fade_reversal"]
        raw["strategy"]["name"] = "break-fade"
        return AppConfig(raw=raw, path=cfg.path)

    def set_daily_closes(self, candles: list[Candle]) -> None:
        self._bf.set_daily_closes(candles)

    def risk_pct(self) -> float:
        return self._bf.risk_pct()

    def compound(self) -> bool:
        return self._bf.compound()

    def on_day_levels(self, levels: LevelSet | None) -> None:
        self._bf.on_day_levels(levels)
        self._3m_buf.clear()

    def on_analysis_15m(self, candle: Candle) -> None:
        """London session: anchor break + EMA on 15m."""
        ms = candle.open_time_ms
        if not self._bf._active_levels or not in_london(ms):
            return
        self._bf._scan_break_setup(candle)

    def feed_ema_bar(self, close: float) -> None:
        self._bf.feed_ema_bar(close)

    def ingest_trend_bar(self, candle: Candle) -> None:
        self._trend_closes.append(candle.close)
        if len(self._trend_closes) >= self._trend_ema_period:
            self._trend_ema = ema(self._trend_closes, self._trend_ema_period)[-1]
        self._last_trend_close = candle.close

    def _trend_allows(self, side: str) -> bool:
        """Long only in HTF uptrend (close > EMA); short only in downtrend."""
        if not self._trend_interval:
            return True
        if len(self._trend_closes) < self._trend_ema_period:
            return False
        if side == "long":
            return self._last_trend_close > self._trend_ema
        return self._last_trend_close < self._trend_ema

    def _pattern_confirms(self, side: str, prev: Candle | None, cur: Candle) -> bool:
        kind = "swing_low" if side == "long" else "swing_high"
        hit = best_pattern_for_reversal(prev, cur, kind)
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

    def on_candle(self, candle: Candle, *, in_trading_window: bool) -> Signal | None:
        if not in_trading_window or not self._bf._active_levels:
            return None

        day = ms_to_ist_date(candle.open_time_ms)
        if self._bf._current_day != day:
            self._bf._current_day = day
            self._bf._trades_today = 0

        ms = candle.open_time_ms
        if not in_new_york(ms):
            return None

        max_trades = int(self.risk.get("max_trades_per_day", 1))
        if self._bf._trades_today >= max_trades:
            return None

        skip = int(self.p.get("skip_first_candles", 2))
        idx = new_york_candle_index(ms, 3)
        if idx < skip:
            return None

        entry_day = ms_to_ist_date(ms)
        for key, conv in (
            ("skip_entry_weekdays", lambda v: entry_day.weekday() in {int(x) for x in v}),
            ("skip_entry_years", lambda v: entry_day.year in {int(y) for y in v}),
            ("skip_entry_months", lambda v: entry_day.month in {int(m) for m in v}),
        ):
            vals = self.p.get(key, [])
            if vals and conv(vals):
                return None
        if not self._bf._passes_regime(ms):
            return None

        pending = self._bf._pending_break
        if pending is None:
            return None

        _brk, level, bull_break = pending
        side = "short" if bull_break else "long"
        opposite_ok = (bull_break and candle.is_red) or (not bull_break and candle.is_green)
        if not opposite_ok or candle.is_flat:
            return None

        self._3m_buf.append(candle)
        prev = self._3m_buf[-2] if len(self._3m_buf) >= 2 else None
        if not self._pattern_confirms(side, prev, candle):
            return None
        if not self._trend_allows(side):
            return None

        self._bf._pending_break = None
        self._bf._trades_today += 1
        stop = float(self.p["stop_usdt"])
        target = float(self.p.get("target_usdt", stop * float(self.p.get("reward_risk", 3.0))))
        max_hold = int(self.p.get("max_hold_bars", 0))
        pat = best_pattern_for_reversal(prev, candle, "swing_low" if side == "long" else "swing_high")
        pname = pat.name if pat else "?"
        return Signal(
            side=side,
            entry_price=candle.close,
            stop_dist=stop,
            target_dist=target,
            reason=f"fade_rev level={level:.2f} {pname}",
            max_hold_bars=max_hold if max_hold > 0 else None,
        )
