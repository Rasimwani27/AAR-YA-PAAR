#!/usr/bin/env python3
"""Populate reversal level DB: last N weekdays, intervals 1-15m. Minimal stdout."""

from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from aar.core.sessions import ms_to_ist_date
from aar.data.vision import load_klines
from aar.reversal.engine import ReversalStore
from aar.reversal.levels import detect_swing_reversals, resample_candles

SYMBOL = "BTCUSDT"
CACHE = ROOT / "out/cache"
DEFAULT_DB = ROOT / "out/reversal_levels.db"
INTERVALS = list(range(1, 16))


def last_trading_days(n: int, end_inclusive: date) -> list[date]:
    days: list[date] = []
    d = end_inclusive
    while len(days) < n:
        if d.weekday() < 5:
            days.append(d)
        d -= timedelta(days=1)
    return sorted(days)


def latest_data_end(cache: Path, symbol: str) -> date:
    probe_start = date.today() - timedelta(days=120)
    probe_end = date.today() + timedelta(days=2)
    c = load_klines(symbol, "15m", probe_start, probe_end, cache, require_data=False)
    if not c:
        return date.today()
    last = ms_to_ist_date(c[-1].open_time_ms)
    return last


def candles_for_day(all_candles: list, day: date) -> list:
    return [c for c in all_candles if ms_to_ist_date(c.open_time_ms) == day]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--symbol", default=SYMBOL)
    ap.add_argument("--db", type=Path, default=DEFAULT_DB)
    ap.add_argument("--left", type=int, default=2)
    ap.add_argument("--right", type=int, default=2)
    ap.add_argument("--quiet", action="store_true", default=True)
    args = ap.parse_args()

    end_day = latest_data_end(CACHE, args.symbol)
    trading_days = last_trading_days(args.days, end_day)
    start_day = trading_days[0] - timedelta(days=3)
    end_fetch = trading_days[-1] + timedelta(days=1)

    store = ReversalStore(args.db)
    store.set_meta("symbol", args.symbol)
    store.set_meta("trading_days", ",".join(str(d) for d in trading_days))
    store.set_meta("intervals_min", ",".join(str(i) for i in INTERVALS))
    store.set_meta("data_end_ist", str(end_day))

    # Prefer native Binance intervals when cached; always anchor resample from 1m.
    native_map = {1: "1m", 3: "3m", 5: "5m", 15: "15m"}
    pad_start = start_day - timedelta(days=1)
    candles_1m = load_klines(args.symbol, "1m", pad_start, end_fetch, CACHE, require_data=False)
    native_cache: dict[int, list] = {1: candles_1m or []}
    for imin, iv in native_map.items():
        if imin == 1:
            continue
        native_cache[imin] = load_klines(
            args.symbol, iv, pad_start, end_fetch, CACHE, require_data=False
        )

    total_rows = 0
    for day in trading_days:
        for imin in INTERVALS:
            if imin in native_cache and native_cache[imin]:
                day_candles = candles_for_day(native_cache[imin], day)
            elif candles_1m:
                day_candles = candles_for_day(resample_candles(candles_1m, imin), day)
            else:
                day_candles = []
            if not day_candles:
                continue
            levels = detect_swing_reversals(
                day_candles,
                symbol=args.symbol,
                interval_min=imin,
                trading_date_ist=str(day),
                left=args.left,
                right=args.right,
            )
            total_rows += store.replace_day(args.symbol, imin, str(day), levels)

    store.set_meta("level_count", str(store.count(args.symbol)))
    store.set_meta("build_complete", "1")
    store.close()

    if not args.quiet:
        print(f"ok rows={total_rows} db={args.db}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
