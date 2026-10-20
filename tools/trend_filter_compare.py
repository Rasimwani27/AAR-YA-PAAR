#!/usr/bin/env python3
"""Compare hybrid best with/without HTF trend filter."""

from __future__ import annotations

import copy
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import tomllib

from aar.backtest.engine import run_backtest
from aar.config import AppConfig

BASE = ROOT / "config.btc.fade-reversal-ny-trend.toml"
START, END = date(2021, 8, 1), date(2026, 8, 1)


def year_slices():
    for y in range(2021, 2027):
        s = date(y, 1, 1)
        e = date(y + 1, 1, 1)
        if y == 2021:
            s = START
        if y == 2026:
            e = END
        if s >= e:
            continue
        yield y, s, e


def run_cfg(raw: dict, label: str) -> dict:
    cfg = AppConfig(raw=raw, path=BASE)
    full = run_backtest(cfg, START, END)
    years = []
    for y, s, e in year_slices():
        r = run_backtest(cfg, s, e)
        years.append({"year": y, **r.summary()})
    return {
        "label": label,
        "full": full.summary(),
        "by_year_isolated": years,
    }


def main() -> int:
    with BASE.open("rb") as f:
        base = tomllib.load(f)

    variants = [
        ("no_trend", {}),
        ("1d_ema50", {"trend_interval": "1d", "trend_ema_period": 50}),
        ("1d_ema200", {"trend_interval": "1d", "trend_ema_period": 200}),
        ("4h_ema50", {"trend_interval": "4h", "trend_ema_period": 50}),
        ("4h_ema100", {"trend_interval": "4h", "trend_ema_period": 100}),
    ]
    results = []
    for label, patch in variants:
        raw = copy.deepcopy(base)
        fr = raw["strategy"]["fade_reversal"]
        fr.pop("trend_interval", None)
        fr.pop("trend_ema_period", None)
        if patch:
            fr.update(patch)
        else:
            fr["trend_interval"] = ""
        print(f"Running {label}...", flush=True)
        results.append(run_cfg(raw, label))

    results.sort(key=lambda x: x["full"]["net_pnl"], reverse=True)
    out = {"variants": results, "best_by_full_net": results[0]["label"]}
    p = ROOT / "out/reports/fade-reversal-trend-compare.json"
    p.write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
