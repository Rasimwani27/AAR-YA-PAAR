#!/usr/bin/env python3
"""Why negative? Loss patterns: year, month, side, weekday, invalid-level days."""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from aar.backtest.engine import run_backtest
from aar.config import load_config
from aar.core.sessions import ms_to_ist_date, ms_to_ist_time


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--config", type=Path, default=ROOT / "config.btc.fade-reversal-ny-trend.toml")
    ap.add_argument("--start", default="2021-08-01")
    ap.add_argument("--end", default="2026-08-01")
    ap.add_argument("--json-out", type=Path, default=ROOT / "out/reports/loss-patterns.json")
    args = ap.parse_args()

    cfg = load_config(args.config)
    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end)
    res = run_backtest(cfg, start, end)

    by_year: dict[int, list] = defaultdict(list)
    by_month: dict[int, list] = defaultdict(list)
    by_weekday: dict[int, list] = defaultdict(list)
    by_side: dict[str, list] = defaultdict(list)
    by_exit: dict[str, list] = defaultdict(list)

    for t in res.trades:
        d = ms_to_ist_date(t.entry_time_ms)
        by_year[d.year].append(t)
        by_month[d.month].append(t)
        by_weekday[d.weekday()].append(t)
        by_side[t.side].append(t)
        by_exit[t.exit_reason].append(t)

    def stats(trades):
        n = len(trades)
        if not n:
            return {"n": 0}
        w = sum(1 for x in trades if x.net_pnl > 0)
        return {
            "n": n,
            "wins": w,
            "win_pct": round(100 * w / n, 1),
            "net": round(sum(x.net_pnl for x in trades), 0),
            "avg_net": round(sum(x.net_pnl for x in trades) / n, 2),
        }

    weekday_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    report = {
        "config": str(args.config),
        "start": str(start),
        "end": str(end),
        "total": stats(res.trades),
        "by_year": {str(y): stats(by_year[y]) for y in sorted(by_year)},
        "by_month": {str(m): stats(by_month[m]) for m in sorted(by_month)},
        "by_weekday": {weekday_names[i]: stats(by_weekday[i]) for i in range(7) if by_weekday[i]},
        "by_side": {k: stats(v) for k, v in by_side.items()},
        "by_exit_reason": {k: stats(v) for k, v in by_exit.items()},
        "avoid_hints": [],
    }

    # Heuristic avoid patterns
    bad_years = [y for y, s in report["by_year"].items() if s.get("net", 0) < -100]
    bad_months = [m for m, s in report["by_month"].items() if s.get("win_pct", 100) < 8 and s.get("n", 0) > 10]
    if bad_years:
        report["avoid_hints"].append(f"Worst years (net <-100): {', '.join(bad_years)} — consider sitting out or smaller size.")
    if bad_months:
        report["avoid_hints"].append(f"Weak months (WR<8%, n>10): {', '.join(bad_months)}.")
    if report["by_exit_reason"].get("stop", {}).get("n", 0) > 0:
        st = report["by_exit_reason"]["stop"]
        report["avoid_hints"].append(
            f"{st['n']} stops vs {report['by_exit_reason'].get('target', {}).get('n', 0)} targets — R:R too wide or entries late."
        )
    fees_est = sum(t.fees for t in res.trades)
    gross = sum(t.gross_pnl for t in res.trades)
    report["fees_total"] = round(fees_est, 0)
    report["gross_total"] = round(gross, 0)
    report["avoid_hints"].append(
        f"Gross {report['gross_total']:+} but fees {report['fees_total']:.0f} — edge is thin; lower trade count or tighter targets help."
    )

    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
