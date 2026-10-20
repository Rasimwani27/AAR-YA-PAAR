#!/usr/bin/env python3
"""
5m NY weekday reversals: compare confluence types (sweep, fib, volume, SL hunt, OB, FVG).
Baseline: strict engulfing at 5m swing pivot in New York session.
Output: out/reports/confluence-winner-5m-ny.json
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from statistics import mean, median

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from aar.core.models import Candle
from aar.core.sessions import in_new_york, ms_to_ist_date
from aar.data.vision import load_klines
from aar.reversal.candle_patterns import two_bar_patterns
from aar.reversal.confluence import evaluate_confluence
from aar.reversal.levels import detect_swing_reversals, resample_candles

SYMBOL = "BTCUSDT"
CACHE = ROOT / "out/cache"
OUT = ROOT / "out/reports/confluence-winner-5m-ny.json"
START = date(2024, 1, 1)
END = date(2026, 8, 1)
IMIN = 5
FORWARD_BARS = 15
SWING_LEFT = SWING_RIGHT = 2
CONFLUENCE_NAMES = (
    "liquidity_sweep",
    "sl_hunting",
    "fib_retrace",
    "volume_spike",
    "order_block",
    "fvg",
)


@dataclass
class Bucket:
    count: int = 0
    moves: list[float] = field(default_factory=list)

    def add(self, m: float) -> None:
        self.count += 1
        self.moves.append(m)

    def summary(self) -> dict:
        if not self.moves:
            return {"count": 0}
        return {
            "count": self.count,
            "avg_usd": round(mean(self.moves), 2),
            "median_usd": round(median(self.moves), 2),
        }


def count_weekdays(start: date, end: date) -> int:
    n, d = 0, start
    while d < end:
        if d.weekday() < 5:
            n += 1
        d += timedelta(days=1)
    return n


def load_5m() -> list[Candle]:
    pad = START - timedelta(days=3)
    end_ex = END + timedelta(days=3)
    c1 = load_klines(SYMBOL, "1m", pad, end_ex, CACHE, require_data=False)
    if not c1:
        raise SystemExit("Missing 1m cache")
    s = load_klines(SYMBOL, "5m", pad, end_ex, CACHE, require_data=False)
    return s if s else resample_candles(c1, 5)


def has_engulfing(prev: Candle | None, c: Candle, kind: str) -> bool:
    if prev is None:
        return False
    low, high = kind == "swing_low", kind == "swing_high"
    for h in two_bar_patterns(prev, c, at_swing_low=low, at_swing_high=high):
        if kind == "swing_low" and h.name == "bullish_engulfing":
            return True
        if kind == "swing_high" and h.name == "bearish_engulfing":
            return True
    return False


def favorable_move(candles: list[Candle], idx: int, kind: str, pivot: float) -> float | None:
    end = min(len(candles), idx + 1 + FORWARD_BARS)
    if end <= idx + 1:
        return None
    window = candles[idx + 1 : end]
    if kind == "swing_low":
        return max(0.0, max(x.high for x in window) - pivot)
    return max(0.0, pivot - min(x.low for x in window))


def session_start_index(day_candles: list[Candle], idx: int) -> int:
    """First bar of NY session on this IST day slice (walk back while in NY)."""
    ms = day_candles[idx].open_time_ms
    if not in_new_york(ms):
        return max(0, idx - 20)
    j = idx
    while j > 0 and in_new_york(day_candles[j - 1].open_time_ms):
        j -= 1
    return j


def main() -> int:
    candles = load_5m()
    weekday_days = count_weekdays(START, END)

    baseline = Bucket()
    by_conf: dict[str, Bucket] = {n: Bucket() for n in CONFLUENCE_NAMES}
    without: dict[str, Bucket] = {n: Bucket() for n in CONFLUENCE_NAMES}
    combo: dict[str, Bucket] = defaultdict(Bucket)

    events = 0

    by_day: dict[str, list[Candle]] = defaultdict(list)
    for c in candles:
        if START <= ms_to_ist_date(c.open_time_ms) < END:
            by_day[str(ms_to_ist_date(c.open_time_ms))].append(c)

    for day_str, day_candles in by_day.items():
        if date.fromisoformat(day_str).weekday() >= 5:
            continue
        levels = detect_swing_reversals(
            day_candles,
            symbol=SYMBOL,
            interval_min=IMIN,
            trading_date_ist=day_str,
            left=SWING_LEFT,
            right=SWING_RIGHT,
        )
        imap = {c.open_time_ms: i for i, c in enumerate(day_candles)}
        for lv in levels:
            if not in_new_york(lv.candle_open_ms):
                continue
            idx = imap.get(lv.candle_open_ms)
            if idx is None:
                continue
            prev = day_candles[idx - 1] if idx > 0 else None
            if not has_engulfing(prev, day_candles[idx], lv.kind):
                continue
            move = favorable_move(day_candles, idx, lv.kind, lv.price)
            if move is None:
                continue

            events += 1
            baseline.add(move)
            sess_i = session_start_index(day_candles, idx)
            flags = evaluate_confluence(day_candles, idx, lv.kind, sess_i)
            active = flags.active_names()

            for name in CONFLUENCE_NAMES:
                if getattr(flags, name):
                    by_conf[name].add(move)
                else:
                    without[name].add(move)

            if active:
                key = "+".join(sorted(active))
                combo[key].add(move)

    base_avg = mean(baseline.moves) if baseline.moves else 0.0
    rows = []
    for name in CONFLUENCE_NAMES:
        with_s = by_conf[name].summary()
        wo = without[name].summary()
        lift = round(with_s.get("avg_usd", 0) - base_avg, 2) if with_s.get("count") else None
        rows.append(
            {
                "confluence": name,
                "with_confluence": with_s,
                "without_confluence": wo,
                "signals_per_weekday_when_present": round(
                    with_s.get("count", 0) / weekday_days, 3
                ),
                "lift_avg_usd_vs_baseline": lift,
                "pct_of_engulfing_events": round(
                    100.0 * with_s.get("count", 0) / max(events, 1), 1
                ),
            }
        )

    rows.sort(
        key=lambda r: (
            r["with_confluence"].get("avg_usd", 0),
            r["with_confluence"].get("count", 0),
        ),
        reverse=True,
    )

    # Overall filter winner (any type): min 80 samples, best avg
    eligible = [r for r in rows if r["with_confluence"].get("count", 0) >= 80]
    filter_winner = eligible[0] if eligible else rows[0]

    level_types = ("liquidity_sweep", "sl_hunting", "fib_retrace", "order_block", "fvg")
    level_rows = [r for r in rows if r["confluence"] in level_types]
    level_eligible = [r for r in level_rows if r["with_confluence"].get("count", 0) >= 80]
    # Level winner: best avg among tools that define a price level (exclude volume)
    level_winner = max(
        level_eligible or level_rows,
        key=lambda r: (r["with_confluence"].get("avg_usd", 0), r["with_confluence"].get("count", 0)),
    )

    top_combos = []
    for key, b in combo.items():
        if b.count < 40:
            continue
        top_combos.append({"combo": key, **b.summary()})
    top_combos.sort(key=lambda r: (r.get("avg_usd", 0), r.get("count", 0)), reverse=True)

    report = {
        "setup": {
            "symbol": SYMBOL,
            "interval": "5m",
            "session": "New York (19:00–01:30 IST)",
            "weekdays_only": True,
            "pattern": "bullish/bearish engulfing at swing pivot",
            "forward_bars": FORWARD_BARS,
            "start": str(START),
            "end": str(END),
        },
        "baseline_engulfing_ny": {
            **baseline.summary(),
            "signals_per_weekday": round(baseline.count / weekday_days, 3),
        },
        "confluence_ranking": rows,
        "declared_winner": {
            "confluence": level_winner["confluence"],
            "category": "level_structure",
            "reason": "Best level-defining confluence for 5m NY engulfing reversals: highest avg "
            "favorable move with ≥80 samples among sweep / SL hunt / fib / order block / FVG.",
            "stats": level_winner["with_confluence"],
            "signals_per_weekday": level_winner["signals_per_weekday_when_present"],
            "lift_avg_usd_vs_baseline": level_winner["lift_avg_usd_vs_baseline"],
        },
        "best_any_confluence_filter": {
            "confluence": filter_winner["confluence"],
            "stats": filter_winner["with_confluence"],
            "signals_per_weekday": filter_winner["signals_per_weekday_when_present"],
        },
        "top_confluence_combos": top_combos[:15],
        "recommendation": None,
    }

    lw = level_winner["confluence"]
    report["recommendation"] = (
        f"Primary rule: 5m NY weekday engulfing at a swing pivot only after `{lw}` "
        f"(wick through prior session/local extreme, close back inside). "
        f"Add `sl_hunting` when equal-high/low pool was swept for confirmation; "
        f"optional `volume_spike` on the pivot bar for larger follow-through."
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
