#!/usr/bin/env python3
"""Year-on-year backtest slices (isolated $1k each year + full chained run)."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from aar.backtest.engine import run_backtest
from aar.config import load_config


def year_windows(full_start: date, full_end: date) -> list[tuple[int, date, date]]:
    out: list[tuple[int, date, date]] = []
    for y in range(full_start.year, full_end.year + 1):
        s = date(y, 1, 1)
        e = date(y + 1, 1, 1)
        if y == full_start.year:
            s = full_start
        if y == full_end.year:
            e = full_end
        if s >= e:
            continue
        out.append((y, s, e))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", type=Path, required=True)
    ap.add_argument("--json-out", type=Path, default=ROOT / "out/reports/year-by-year.json")
    args = ap.parse_args()

    cfg = load_config(args.config)
    bt = cfg.section("backtest")
    full_start = date.fromisoformat(bt["start"])
    full_end = date.fromisoformat(bt["end"])

    isolated = []
    for y, s, e in year_windows(full_start, full_end):
        r = run_backtest(cfg, s, e)
        isolated.append(
            {
                "year": y,
                "start": str(s),
                "end": str(e),
                **r.summary(),
            }
        )

    full = run_backtest(cfg, full_start, full_end)

    report = {
        "config": str(args.config),
        "filters_note": "Each year row = fresh $1000, compound within that slice only.",
        "full_period_chained": {
            "start": str(full_start),
            "end": str(full_end),
            **full.summary(),
        },
        "by_year_isolated": isolated,
    }
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
