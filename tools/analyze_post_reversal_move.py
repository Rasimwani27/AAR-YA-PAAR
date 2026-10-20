#!/usr/bin/env python3
"""Measure BTC move after swing reversals in the stored DB."""

from __future__ import annotations

import json
import sqlite3
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from statistics import mean, median

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from aar.core.models import Candle
from aar.data.vision import load_klines
from aar.reversal.levels import resample_candles

DB = ROOT / "out/reversal_levels.db"
CACHE = ROOT / "out/cache"
SYMBOL = "BTCUSDT"

# Forward windows in minutes (from reversal bar close)
HORIZONS = [15, 30, 60, 120, 240]


def load_meta(conn: sqlite3.Connection) -> dict[str, str]:
    return {r[0]: r[1] for r in conn.execute("SELECT key, value FROM build_meta")}


def candles_by_interval(
    start: date, end: date, intervals: set[int]
) -> dict[int, list[Candle]]:
    pad = start - timedelta(days=2)
    end_ex = end + timedelta(days=2)
    out: dict[int, list[Candle]] = {}
    c1 = load_klines(SYMBOL, "1m", pad, end_ex, CACHE, require_data=False)
    if not c1:
        return out
    for imin in intervals:
        if imin in (1, 3, 5, 15):
            iv = {1: "1m", 3: "3m", 5: "5m", 15: "15m"}[imin]
            if imin == 1:
                out[1] = c1
            else:
                s = load_klines(SYMBOL, iv, pad, end_ex, CACHE, require_data=False)
                out[imin] = s if s else resample_candles(c1, imin)
        else:
            out[imin] = resample_candles(c1, imin)
    return out


def index_candles(candles: list[Candle]) -> dict[int, int]:
    return {c.open_time_ms: i for i, c in enumerate(candles)}


def forward_moves(
    candles: list[Candle],
    idx: int,
    kind: str,
    pivot_price: float,
    horizon_bars: int,
) -> tuple[float | None, float | None]:
    """Returns (move_in_favor_usd, move_against_usd) from pivot for horizon."""
    if idx < 0 or idx >= len(candles):
        return None, None
    end = min(len(candles), idx + 1 + horizon_bars)
    if end <= idx + 1:
        return None, None
    window = candles[idx + 1 : end]
    if not window:
        return None, None
    if kind == "swing_high":
        max_down = pivot_price - min(c.low for c in window)
        max_up = max(c.high for c in window) - pivot_price
        return max(0.0, max_down), max(0.0, max_up)
    # swing_low
    max_up = max(c.high for c in window) - pivot_price
    max_down = pivot_price - min(c.low for c in window)
    return max(0.0, max_up), max(0.0, max_down)


def summarize(values: list[float]) -> dict:
    if not values:
        return {"n": 0}
    values = sorted(values)
    return {
        "n": len(values),
        "mean": round(mean(values), 1),
        "median": round(median(values), 1),
        "p75": round(values[int(0.75 * (len(values) - 1))], 1),
        "p90": round(values[int(0.90 * (len(values) - 1))], 1),
    }


def main() -> int:
    conn = sqlite3.connect(DB)
    meta = load_meta(conn)
    days = [date.fromisoformat(x) for x in (meta.get("trading_days") or "").split(",") if x]
    if not days:
        print(json.dumps({"error": "no build_meta trading_days"}))
        return 1
    start, end = min(days), max(days)

    rows = conn.execute(
        """
        SELECT interval_min, kind, price, candle_open_ms
        FROM reversal_level
        WHERE symbol=?
        ORDER BY interval_min, candle_open_ms
        """,
        (SYMBOL,),
    ).fetchall()
    conn.close()

    intervals = {r[0] for r in rows}
    series = candles_by_interval(start, end, intervals)

    # Aggregate: all TF pooled + per TF
    pooled_favor: dict[str, dict[int, list[float]]] = {
        "after_swing_high_down": defaultdict(list),
        "after_swing_high_up_against": defaultdict(list),
        "after_swing_low_up": defaultdict(list),
        "after_swing_low_down_against": defaultdict(list),
    }
    by_tf: dict[int, dict[str, dict[int, list[float]]]] = defaultdict(
        lambda: {
            "high_favor_down": defaultdict(list),
            "high_against_up": defaultdict(list),
            "low_favor_up": defaultdict(list),
            "low_against_down": defaultdict(list),
        }
    )

    for imin, kind, price, oms in rows:
        candles = series.get(imin)
        if not candles:
            continue
        idx_map = index_candles(candles)
        idx = idx_map.get(oms)
        if idx is None:
            # nearest bar at or after
            idx = next((i for i, c in enumerate(candles) if c.open_time_ms >= oms), None)
        if idx is None:
            continue
        bar_min = imin
        for h_min in HORIZONS:
            h_bars = max(1, h_min // bar_min)
            favor, against = forward_moves(candles, idx, kind, price, h_bars)
            if favor is None:
                continue
            if kind == "swing_high":
                pooled_favor["after_swing_high_down"][h_min].append(favor)
                pooled_favor["after_swing_high_up_against"][h_min].append(against)
                by_tf[imin]["high_favor_down"][h_min].append(favor)
                by_tf[imin]["high_against_up"][h_min].append(against)
            else:
                pooled_favor["after_swing_low_up"][h_min].append(favor)
                pooled_favor["after_swing_low_down_against"][h_min].append(against)
                by_tf[imin]["low_favor_up"][h_min].append(favor)
                by_tf[imin]["low_against_down"][h_min].append(against)

    report = {
        "symbol": SYMBOL,
        "trading_days": len(days),
        "reversal_events": len(rows),
        "horizons_minutes": HORIZONS,
        "pooled_all_timeframes": {
            "after_swing_high": {
                "typical_drop_usd": {str(h): summarize(pooled_favor["after_swing_high_down"][h]) for h in HORIZONS},
                "typical_bounce_against_usd": {
                    str(h): summarize(pooled_favor["after_swing_high_up_against"][h]) for h in HORIZONS
                },
            },
            "after_swing_low": {
                "typical_rally_usd": {str(h): summarize(pooled_favor["after_swing_low_up"][h]) for h in HORIZONS},
                "typical_drop_against_usd": {
                    str(h): summarize(pooled_favor["after_swing_low_down_against"][h]) for h in HORIZONS
                },
            },
        },
        "by_timeframe_min": {},
    }

    for imin in sorted(by_tf.keys()):
        tf = by_tf[imin]
        report["by_timeframe_min"][str(imin)] = {
            "after_high_median_drop": {str(h): summarize(tf["high_favor_down"][h]).get("median") for h in HORIZONS},
            "after_low_median_rally": {str(h): summarize(tf["low_favor_up"][h]).get("median") for h in HORIZONS},
        }

    out_path = ROOT / "out/reports/post-reversal-move.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
