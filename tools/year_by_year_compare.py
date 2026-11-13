#!/usr/bin/env python3
"""Side-by-side year-by-year P&L: baseline vs filtered config."""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from aar.backtest.engine import run_backtest
from aar.config import load_config
from tools.year_by_year_report import year_windows


def run_slices(cfg_path: Path) -> dict:
    cfg = load_config(cfg_path)
    bt = cfg.section("backtest")
    full_start = date.fromisoformat(bt["start"])
    full_end = date.fromisoformat(bt["end"])
    by_year = {}
    for y, s, e in year_windows(full_start, full_end):
        r = run_backtest(cfg, s, e)
        by_year[y] = {**r.summary(), "start": str(s), "end": str(e)}
    full = run_backtest(cfg, full_start, full_end)
    return {
        "config": str(cfg_path.name),
        "full_chained": {**full.summary(), "start": str(full_start), "end": str(full_end)},
        "by_year": by_year,
    }


def main() -> int:
    before_path = ROOT / "config.btc.london-mid-engulf-winner.toml"
    now_path = ROOT / "config.btc.london-mid-engulf-winner-filtered.toml"
    before = run_slices(before_path)
    now = run_slices(now_path)

    years = sorted(set(before["by_year"]) | set(now["by_year"]))
    rows = []
    for y in years:
        b = before["by_year"].get(y, {})
        n = now["by_year"].get(y, {})
        rows.append(
            {
                "year": y,
                "before_net_pnl": b.get("net_pnl"),
                "before_return_pct": b.get("return_pct"),
                "before_trades": b.get("trades"),
                "now_net_pnl": n.get("net_pnl"),
                "now_return_pct": n.get("return_pct"),
                "now_trades": n.get("trades"),
                "delta_net": round((n.get("net_pnl") or 0) - (b.get("net_pnl") or 0), 2),
            }
        )

    out = {
        "note": "Each year = fresh $1000, compound within that calendar slice only. "
        "Full chained = one account over entire backtest range.",
        "before_label": "Winner (skip Sun/Mon/Sat, hours 17–18 IST)",
        "now_label": "Filtered (+ skip Tue, + skip 14:00 IST)",
        "before": before,
        "now": now,
        "comparison_rows": rows,
    }
    path = ROOT / "out/reports/year-by-year-before-vs-now.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps({"comparison_rows": rows, "before_chained": before["full_chained"], "now_chained": now["full_chained"]}, indent=2))
    print(f"\nWrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
