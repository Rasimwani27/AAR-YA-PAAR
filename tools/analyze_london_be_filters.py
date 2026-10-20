#!/usr/bin/env python3
"""Breakeven London-mid: when to skip, BE buffer tweaks, MFE on stopped trades."""

from __future__ import annotations

import copy
import json
import sys
from collections import defaultdict
from dataclasses import asdict
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import aar.strategies  # noqa: F401
from aar.backtest.engine import _date_ms, run_backtest
from aar.config import AppConfig, load_config
from aar.core.sessions import london_minutes_from_open, ms_to_ist_date, ms_to_ist_time
from aar.data.vision import load_klines


def _entry_hour_ist(ms: int) -> int:
    return ms_to_ist_time(ms).hour


def mfe_usd(side: str, entry: float, candles) -> float:
    if side == "long":
        return max((c.high - entry) for c in candles) if candles else 0.0
    return max((entry - c.low) for c in candles) if candles else 0.0


def mae_usd(side: str, entry: float, candles) -> float:
    if side == "long":
        return max((entry - c.low) for c in candles) if candles else 0.0
    return max((c.high - entry) for c in candles) if candles else 0.0


def stats(trades: list) -> dict:
    if not trades:
        return {"n": 0}
    w = sum(1 for t in trades if t.net_pnl > 0)
    return {
        "n": len(trades),
        "win_pct": round(100 * w / len(trades), 1),
        "net": round(sum(t.net_pnl for t in trades), 2),
        "avg": round(sum(t.net_pnl for t in trades) / len(trades), 2),
    }


def run_cfg(base: AppConfig, start: date, end: date, overrides: dict) -> dict:
    raw = copy.deepcopy(base.raw)
    p = raw.setdefault("strategy", {}).setdefault("london_mid_engulf", {})
    for k, v in overrides.items():
        if k.startswith("trail."):
            p.setdefault("trailing", {})[k.split(".", 1)[1]] = v
        elif k == "skip_entry_weekdays":
            p[k] = list(v)
        else:
            p[k] = v
    cfg = AppConfig(raw=raw, path=base.path)
    r = run_backtest(cfg, start, end)
    return {**r.summary(), "overrides": overrides}


def main() -> None:
    base = load_config(ROOT / "config.btc.london-mid-engulf.toml")
    bt = base.section("backtest")
    start = date.fromisoformat(str(bt["start"]))
    end = date.fromisoformat(str(bt["end"]))
    stop = float(base.raw["strategy"]["london_mid_engulf"]["stop_usdt"])
    be_trig = float(base.raw["strategy"]["london_mid_engulf"]["trailing"]["be_trigger_usd"])

    res = run_backtest(base, start, end)
    start_ms = _date_ms(start)
    end_ms = _date_ms(end)
    exec_c = [
        c
        for c in load_klines(base.symbol, base.interval, start, end, base.cache_dir, require_data=True)
        if start_ms <= c.open_time_ms < end_ms
    ]
    exec_sorted = sorted(exec_c, key=lambda c: c.open_time_ms)
    times = [c.open_time_ms for c in exec_sorted]

    def candles_between(entry_ms: int, exit_ms: int):
        import bisect

        i = bisect.bisect_left(times, entry_ms)
        j = bisect.bisect_right(times, exit_ms)
        return exec_sorted[i:j]

    enriched = []
    by_wd: dict[int, list] = defaultdict(list)
    by_hour: dict[int, list] = defaultdict(list)
    by_london_slot: dict[str, list] = defaultdict(list)
    by_month: dict[int, list] = defaultdict(list)

    trail_losses = []
    for t in res.trades:
        path = candles_between(t.entry_time_ms, t.exit_time_ms)
        mfe = mfe_usd(t.side, t.entry_price, path)
        mae = mae_usd(t.side, t.entry_price, path)
        entry_h = _entry_hour_ist(t.entry_time_ms)
        lon_min = london_minutes_from_open(t.entry_time_ms)
        if lon_min < 60:
            slot = "lon_0-60m"
        elif lon_min < 120:
            slot = "lon_60-120m"
        elif lon_min < 180:
            slot = "lon_120-180m"
        else:
            slot = "lon_180m+"
        row = {
            **asdict(t),
            "entry_weekday": ms_to_ist_date(t.entry_time_ms).weekday(),
            "entry_hour_ist": entry_h,
            "london_slot": slot,
            "mfe_usd": round(mfe, 2),
            "mae_usd": round(mae, 2),
            "reached_be_trigger": mfe >= be_trig - 1,
            "near_be": be_trig - 50 <= mfe < be_trig,
        }
        enriched.append(row)
        wd = row["entry_weekday"]
        by_wd[wd].append(t)
        by_hour[entry_h].append(t)
        by_london_slot[slot].append(t)
        by_month[ms_to_ist_date(t.entry_time_ms).month].append(t)
        if t.net_pnl <= 0 and t.exit_reason == "trail_stop":
            trail_losses.append(row)

    wd_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    weekday_report = {wd_names[i]: stats(by_wd[i]) for i in sorted(by_wd)}
    hour_report = {str(h): stats(by_hour[h]) for h in sorted(by_hour)}
    slot_report = {k: stats(v) for k, v in sorted(by_london_slot.items())}
    month_report = {str(m): stats(v) for m, v in sorted(by_month.items())}

    # Trail-stop loss anatomy
    n_tl = len(trail_losses)
    hit_be_then_stop = sum(1 for r in trail_losses if r["reached_be_trigger"])
    near_miss = sum(1 for r in trail_losses if r["near_be"])
    stopped_full_sl = sum(1 for r in trail_losses if r["mae_usd"] >= stop - 20 and not r["reached_be_trigger"])

    # Greedy skip-one filters on static trade list (linear approx, no compound)
    def net_if_skip(trades, pred) -> float:
        return sum(t.net_pnl for t in trades if not pred(t))

    skip_candidates = []
    for i, name in enumerate(wd_names[:5]):
        s = weekday_report.get(name, {})
        if s.get("n", 0) >= 30 and s.get("net", 0) < -50:
            skip_candidates.append(
                {
                    "type": "weekday",
                    "value": i,
                    "label": name,
                    "baseline_net": round(sum(t.net_pnl for t in res.trades), 2),
                    "if_skip_net": round(
                        net_if_skip(res.trades, lambda t, i=i: ms_to_ist_date(t.entry_time_ms).weekday() == i),
                        2,
                    ),
                    "stats": s,
                }
            )
    for h, s in hour_report.items():
        if s.get("n", 0) >= 25 and s.get("net", 0) < -40:
            skip_candidates.append(
                {
                    "type": "hour_ist",
                    "value": int(h),
                    "label": f"hour_{h}",
                    "if_skip_net": round(
                        net_if_skip(
                            res.trades,
                            lambda t, h=int(h): _entry_hour_ist(t.entry_time_ms) == h,
                        ),
                        2,
                    ),
                    "stats": s,
                }
            )
    def in_slot(ms: int, slot: str) -> bool:
        m = london_minutes_from_open(ms)
        if m < 0:
            return False
        if slot == "lon_0-60m":
            return m < 60
        if slot == "lon_60-120m":
            return 60 <= m < 120
        if slot == "lon_120-180m":
            return 120 <= m < 180
        return m >= 180

    for slot, s in slot_report.items():
        if s.get("n", 0) >= 40 and s.get("net", 0) < -60:
            skip_candidates.append(
                {
                    "type": "london_slot",
                    "value": slot,
                    "if_skip_net": round(
                        net_if_skip(res.trades, lambda t, slot=slot: in_slot(t.entry_time_ms, slot)),
                        2,
                    ),
                    "stats": s,
                }
            )

    skip_candidates.sort(key=lambda x: x["if_skip_net"], reverse=True)

    # Backtest filter / buffer variants
    variants = [
        {},
        {"skip_entry_hours_ist": [17, 18]},
        {"skip_entry_weekdays": [5, 6, 0]},
        {"skip_entry_weekdays": [5, 6, 1]},
        {"skip_london_minute_ranges": [[60, 120]]},
        {"skip_london_minute_ranges": [[60, 120]], "skip_entry_weekdays": [5, 6, 0]},
        {"skip_london_minute_ranges": [[60, 120]], "skip_entry_hours_ist": [17, 18]},
        {
            "skip_london_minute_ranges": [[60, 120]],
            "skip_entry_weekdays": [5, 6, 0],
            "skip_entry_hours_ist": [17, 18],
        },
        {"skip_london_minutes_after": 300},
        {"skip_entry_months": [5, 6, 12]},
        {"skip_entry_months": [5, 6, 12], "skip_london_minute_ranges": [[60, 120]]},
        {"trail.be_offset_usd": 25},
        {"trail.be_offset_usd": 50},
        {"trail.be_trigger_usd": 175},
        {"trail.be_trigger_usd": 225},
        {"skip_london_minute_ranges": [[60, 120]], "trail.be_offset_usd": 25},
    ]
    variant_results = []
    for ov in variants:
        variant_results.append(run_cfg(base, start, end, ov))

    variant_results.sort(key=lambda x: x["net_pnl"], reverse=True)

    out = {
        "baseline": res.summary(),
        "stop_usdt": stop,
        "be_trigger_usd": be_trig,
        "weekday": weekday_report,
        "hour_ist": hour_report,
        "london_session_slot": slot_report,
        "month": month_report,
        "trail_stop_losses": {
            "count": n_tl,
            "reached_be_trigger_before_stop": hit_be_then_stop,
            "near_miss_within_50_usd_of_be": near_miss,
            "likely_full_initial_sl": stopped_full_sl,
        },
        "skip_candidates_greedy": skip_candidates[:15],
        "backtest_variants": variant_results,
        "best_variants_top5": variant_results[:5],
    }
    path = ROOT / "out/reports/london-be-filter-analysis.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps({k: out[k] for k in out if k != "backtest_variants"}, indent=2))
    print(f"\nWrote {path}")


if __name__ == "__main__":
    main()
