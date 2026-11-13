#!/usr/bin/env python3
"""
1m / 3m / 5m: candle patterns at swing reversals, combo stats, avg reversal move (USD).
Weekdays only (Mon–Fri IST). Output: out/reports/candle-combo-reversal-1m3m5m.json
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
from aar.core.sessions import (
    LONDON_END,
    LONDON_START,
    NEW_YORK_END,
    NEW_YORK_START,
    in_london,
    in_new_york,
    ms_to_ist_date,
)
from aar.data.vision import load_klines
from aar.reversal.candle_patterns import PatternHit, single_bar_patterns, two_bar_patterns
from aar.reversal.levels import detect_swing_reversals, resample_candles

SYMBOL = "BTCUSDT"
CACHE = ROOT / "out/cache"
OUT = ROOT / "out/reports/candle-combo-reversal-1m3m5m.json"
OUT_SESSIONS = ROOT / "out/reports/candle-combo-reversal-london-ny-1m3m5m.json"
START = date(2024, 1, 1)
END = date(2026, 8, 1)
INTERVALS = (1, 3, 5)
FORWARD_BARS = 15
SWING_LEFT = SWING_RIGHT = 2


@dataclass
class MoveStats:
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
            "p75_usd": round(sorted(self.moves)[int(len(self.moves) * 0.75)], 2),
        }


def load_tf(start: date, end: date) -> dict[int, list[Candle]]:
    pad = start - timedelta(days=3)
    end_ex = end + timedelta(days=3)
    c1 = load_klines(SYMBOL, "1m", pad, end_ex, CACHE, require_data=False)
    if not c1:
        raise SystemExit("No 1m data — check out/cache or network.")
    out: dict[int, list[Candle]] = {1: c1}
    for imin in (3, 5):
        iv = f"{imin}m"
        s = load_klines(SYMBOL, iv, pad, end_ex, CACHE, require_data=False)
        out[imin] = s if s else resample_candles(c1, imin)
    return out


def is_weekday(ms: int) -> bool:
    return ms_to_ist_date(ms).weekday() < 5


def count_weekdays(start: date, end: date) -> int:
    n = 0
    d = start
    while d < end:
        if d.weekday() < 5:
            n += 1
        d += timedelta(days=1)
    return n


def pivot_session(ms: int) -> str | None:
    if in_london(ms):
        return "london"
    if in_new_york(ms):
        return "new_york"
    return None


def aligned_hits(prev: Candle | None, c: Candle, kind: str) -> list[PatternHit]:
    low = kind == "swing_low"
    high = kind == "swing_high"
    want = "bullish_reversal" if low else "bearish_reversal"
    hits = single_bar_patterns(c, at_swing_low=low, at_swing_high=high)
    hits.extend(two_bar_patterns(prev, c, at_swing_low=low, at_swing_high=high))
    return [h for h in hits if h.family == want or h.family == "neutral_reversal"]


def favorable_move(candles: list[Candle], idx: int, kind: str, pivot: float, bars: int) -> float | None:
    end = min(len(candles), idx + 1 + bars)
    if end <= idx + 1:
        return None
    window = candles[idx + 1 : end]
    if kind == "swing_low":
        return max(0.0, max(x.high for x in window) - pivot)
    return max(0.0, pivot - min(x.low for x in window))


def main() -> int:
    series = load_tf(START, END)
    idx_maps = {imin: {c.open_time_ms: i for i, c in enumerate(cs)} for imin, cs in series.items()}

    swings_total: dict[int, int] = defaultdict(int)
    swings_weekday: dict[int, int] = defaultdict(int)
    single_stats: dict[int, dict[str, MoveStats]] = defaultdict(lambda: defaultdict(MoveStats))
    combo_stats: dict[int, dict[str, MoveStats]] = defaultdict(lambda: defaultdict(MoveStats))
    strict_single_counts: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    # (tf, session) -> stats
    session_all: dict[tuple[int, str], MoveStats] = defaultdict(MoveStats)
    session_single: dict[tuple[int, str], dict[str, MoveStats]] = defaultdict(
        lambda: defaultdict(MoveStats)
    )
    session_combo: dict[tuple[int, str], dict[str, MoveStats]] = defaultdict(
        lambda: defaultdict(MoveStats)
    )
    session_swing_counts: dict[tuple[int, str], int] = defaultdict(int)

    for imin in INTERVALS:
        candles = series[imin]
        by_day: dict[str, list[Candle]] = defaultdict(list)
        for c in candles:
            if START <= ms_to_ist_date(c.open_time_ms) < END:
                by_day[str(ms_to_ist_date(c.open_time_ms))].append(c)

        for day_str, day_candles in by_day.items():
            d = date.fromisoformat(day_str)
            if d.weekday() >= 5:
                continue
            levels = detect_swing_reversals(
                day_candles,
                symbol=SYMBOL,
                interval_min=imin,
                trading_date_ist=day_str,
                left=SWING_LEFT,
                right=SWING_RIGHT,
            )
            imap = {c.open_time_ms: i for i, c in enumerate(day_candles)}
            for lv in levels:
                swings_total[imin] += 1
                if not is_weekday(lv.candle_open_ms):
                    continue
                swings_weekday[imin] += 1
                idx = imap.get(lv.candle_open_ms)
                if idx is None:
                    continue
                prev = day_candles[idx - 1] if idx > 0 else None
                c = day_candles[idx]
                move = favorable_move(day_candles, idx, lv.kind, lv.price, FORWARD_BARS)
                if move is None:
                    continue

                hits = aligned_hits(prev, c, lv.kind)
                if not hits:
                    continue

                # Best strict hit first, else best any
                hits.sort(key=lambda h: (h.strict, h.name), reverse=True)
                best = hits[0]
                prev_hits = (
                    aligned_hits(day_candles[idx - 2] if idx > 1 else None, prev, lv.kind)
                    if prev
                    else []
                )
                prev_name = "none"
                if prev_hits:
                    prev_hits.sort(key=lambda h: (h.strict, h.name), reverse=True)
                    prev_name = prev_hits[0].name

                single_stats[imin][best.name].add(move)
                if best.strict:
                    strict_single_counts[imin][best.name] += 1

                combo_key = f"{prev_name}+{best.name}"
                combo_stats[imin][combo_key].add(move)

                sess = pivot_session(lv.candle_open_ms)
                if sess:
                    session_swing_counts[(imin, sess)] += 1
                    session_all[(imin, sess)].add(move)
                    session_single[(imin, sess)][best.name].add(move)
                    session_combo[(imin, sess)][combo_key].add(move)

    def top_table(stats: dict[str, MoveStats], min_n: int = 25) -> list[dict]:
        rows = []
        for name, st in stats.items():
            if st.count < min_n:
                continue
            rows.append({"name": name, **st.summary()})
        rows.sort(key=lambda r: (r.get("count", 0), r.get("avg_usd", 0)), reverse=True)
        return rows[:25]

    report = {
        "symbol": SYMBOL,
        "start": str(START),
        "end": str(END),
        "weekdays_only": True,
        "forward_bars_after_pivot": FORWARD_BARS,
        "swing_fractal": f"{SWING_LEFT} left / {SWING_RIGHT} right",
        "swing_counts": {str(k): {"all": swings_total[k], "weekday": swings_weekday[k]} for k in INTERVALS},
        "by_timeframe": {},
    }

    for imin in INTERVALS:
        singles = top_table(single_stats[imin], min_n=20)
        combos = top_table(combo_stats[imin], min_n=15)
        best_single = singles[0] if singles else None
        best_combo = combos[0] if combos else None
        all_moves = [m for st in single_stats[imin].values() for m in st.moves]
        report["by_timeframe"][str(imin)] = {
            "interval": f"{imin}m",
            "weekday_swings_with_aligned_pattern": sum(s.count for s in single_stats[imin].values()),
            "overall_avg_reversal_usd_when_pattern": round(mean(all_moves), 2) if all_moves else None,
            "overall_median_reversal_usd": round(median(all_moves), 2) if all_moves else None,
            "top_single_patterns": singles,
            "top_two_bar_combos_prev_plus_pivot": combos,
            "best_single_by_count": best_single,
            "best_combo_by_count": best_combo,
            "best_single_by_avg_usd_min30": max(
                (r for r in singles if r.get("count", 0) >= 30),
                key=lambda r: r.get("avg_usd", 0),
                default=None,
            ),
        }

    # Cross-TF winner
    best_tf_count = max(INTERVALS, key=lambda t: report["by_timeframe"][str(t)]["weekday_swings_with_aligned_pattern"])
    report["summary"] = {
        "most_reversal_signals_tf": f"{best_tf_count}m",
        "note": "Reversal = favorable USD move within forward bars after weekday swing pivot with aligned candle pattern.",
    }

    weekday_days = count_weekdays(START, END)

    def session_report() -> dict:
        sessions_meta = {
            "timezone": "Asia/Kolkata (IST, fixed)",
            "london": f"{LONDON_START.strftime('%H:%M')}–{LONDON_END.strftime('%H:%M')} IST",
            "new_york": f"{NEW_YORK_START.strftime('%H:%M')}–{NEW_YORK_END.strftime('%H:%M')} IST (crosses midnight)",
        }
        by_tf: dict[str, dict] = {}
        for imin in INTERVALS:
            by_sess: dict[str, dict] = {}
            for sess in ("london", "new_york"):
                key = (imin, sess)
                all_st = session_all[key]
                moves = all_st.moves
                singles = top_table(session_single[key], min_n=15)
                combos = top_table(session_combo[key], min_n=10)
                by_sess[sess] = {
                    "swing_pivots_in_session": session_swing_counts[key],
                    "with_aligned_pattern": all_st.count,
                    "avg_reversal_usd": round(mean(moves), 2) if moves else None,
                    "median_reversal_usd": round(median(moves), 2) if moves else None,
                    "signals_per_weekday": round(all_st.count / weekday_days, 2) if weekday_days else None,
                    "top_single_pattern": singles[0] if singles else None,
                    "top_combo_prev_plus_pivot": combos[0] if combos else None,
                    "top_singles": singles[:10],
                    "top_combos": combos[:10],
                }
            # Head-to-head within this TF
            lc = by_sess["london"]["with_aligned_pattern"] or 0
            nc = by_sess["new_york"]["with_aligned_pattern"] or 0
            la = by_sess["london"]["avg_reversal_usd"] or 0
            na = by_sess["new_york"]["avg_reversal_usd"] or 0
            by_tf[str(imin)] = {
                "interval": f"{imin}m",
                "sessions": by_sess,
                "more_signals_in": "london" if lc >= nc else "new_york",
                "higher_avg_reversal_in": "london" if la >= na else "new_york",
            }

        # Cross-TF winners per session (for ~1 trade/day: balance count vs avg)
        comparison: dict[str, dict] = {}
        for sess in ("london", "new_york"):
            rows = []
            for imin in INTERVALS:
                s = by_tf[str(imin)]["sessions"][sess]
                rows.append(
                    {
                        "interval": f"{imin}m",
                        "count": s["with_aligned_pattern"],
                        "signals_per_weekday": s["signals_per_weekday"],
                        "avg_usd": s["avg_reversal_usd"],
                        "median_usd": s["median_reversal_usd"],
                        "top_combo": s["top_combo_prev_plus_pivot"],
                    }
                )
            best_count = max(rows, key=lambda r: r["count"] or 0)
            best_avg = max(rows, key=lambda r: r["avg_usd"] or 0)
            best_daily = max(rows, key=lambda r: r["signals_per_weekday"] or 0)
            comparison[sess] = {
                "by_timeframe": rows,
                "most_reversals_tf": best_count["interval"],
                "highest_avg_reversal_tf": best_avg["interval"],
                "most_signals_per_weekday_tf": best_daily["interval"],
            }

        return {
            "symbol": SYMBOL,
            "start": str(START),
            "end": str(END),
            "weekday_ist_days_in_range": weekday_days,
            "sessions_ist": sessions_meta,
            "forward_bars_after_pivot": FORWARD_BARS,
            "swing_fractal": f"{SWING_LEFT} left / {SWING_RIGHT} right",
            "by_timeframe": by_tf,
            "session_comparison": comparison,
            "note": "Pivots outside London/NY (observation, Asia close gap, etc.) excluded from session tables.",
        }

    session_doc = session_report()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2))
    OUT_SESSIONS.write_text(json.dumps(session_doc, indent=2))
    print(json.dumps(session_doc, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
