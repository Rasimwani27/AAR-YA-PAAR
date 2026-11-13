#!/usr/bin/env python3
"""5-year backtest: production exits vs top exit-mode winner per strategy (research only)."""

from __future__ import annotations

import copy
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import aar.strategies  # noqa: F401
from aar.backtest.engine import run_backtest
from aar.config import AppConfig, load_config
from tools.sweep_exit_modes_both import (
    _apply_trailing_fade,
    _apply_trailing_london,
    scenario_grid,
)
from tools.year_by_year_report import year_windows


def _cfg_from_path(cfg_path: Path, patch) -> AppConfig:
    raw = copy.deepcopy(load_config(cfg_path).raw)
    if patch:
        patch(raw)
    return AppConfig(raw=raw, path=cfg_path)


def _slice_report(cfg: AppConfig, full_start: date, full_end: date) -> dict:
    full = run_backtest(cfg, full_start, full_end)
    by_year = []
    for y, s, e in year_windows(full_start, full_end):
        r = run_backtest(cfg, s, e)
        by_year.append({"year": y, "start": str(s), "end": str(e), **r.summary()})
    return {
        "full_chained": {
            "start": str(full_start),
            "end": str(full_end),
            **full.summary(),
        },
        "by_year_isolated": by_year,
    }


def _scenario_by_id(scenario_id: str) -> dict:
    for sc in scenario_grid():
        if sc["id"] == scenario_id:
            return sc
    raise KeyError(scenario_id)


def _load_bests() -> tuple[str, str]:
    path = ROOT / "out/reports/exit-modes-both-strategies.json"
    if path.is_file():
        data = json.loads(path.read_text(encoding="utf-8"))
        return data["best_london"]["scenario_id"], data["best_fade"]["scenario_id"]
    return "B1_dyn_sl_fixed_tp_be200", "B3_dyn_sl_fixed_tp_be0"


def main() -> int:
    london_path = ROOT / "config.btc.london-mid-engulf-winner.toml"
    fade_path = ROOT / "config.btc.fade-reversal-ny-trend.toml"
    best_london_id, best_fade_id = _load_bests()
    top_london = _scenario_by_id(best_london_id)
    top_fade = _scenario_by_id(best_fade_id)

    bt = load_config(london_path).section("backtest")
    full_start = date.fromisoformat(bt["start"])
    full_end = date.fromisoformat(bt["end"])
    period_label = f"{full_start} .. {full_end}"

    def run_london(label: str, scenario_id: str | None, desc: str, patch) -> dict:
        cfg = _cfg_from_path(london_path, patch)
        return {
            "label": label,
            "scenario_id": scenario_id,
            "description": desc,
            "config": str(london_path.name),
            **_slice_report(cfg, full_start, full_end),
        }

    def run_fade(label: str, scenario_id: str | None, desc: str, patch) -> dict:
        cfg = _cfg_from_path(fade_path, patch)
        return {
            "label": label,
            "scenario_id": scenario_id,
            "description": desc,
            "config": str(fade_path.name),
            **_slice_report(cfg, full_start, full_end),
        }

    london_current = run_london(
        "current_production",
        None,
        "Production TOML (BE@200 trail, fixed 10R target)",
        None,
    )
    london_top = run_london(
        "top_exit_winner",
        top_london["id"],
        top_london["description"],
        lambda r: _apply_trailing_london(r, top_london["trailing"]),
    )

    fade_current = run_fade(
        "current_production",
        "A1_fixed_sl_fixed_tp",
        "Production TOML (fixed $500 SL / $1500 TP, no trail)",
        None,
    )
    fade_top = run_fade(
        "top_exit_winner",
        top_fade["id"],
        top_fade["description"],
        lambda r: _apply_trailing_fade(r, top_fade["trailing"]),
    )

    def delta_rows(current: dict, top: dict) -> list[dict]:
        years = {r["year"] for r in current["by_year_isolated"]} | {
            r["year"] for r in top["by_year_isolated"]
        }
        cur_map = {r["year"]: r for r in current["by_year_isolated"]}
        top_map = {r["year"]: r for r in top["by_year_isolated"]}
        rows = []
        for y in sorted(years):
            c, t = cur_map.get(y, {}), top_map.get(y, {})
            rows.append(
                {
                    "year": y,
                    "current_return_pct": c.get("return_pct"),
                    "current_net_pnl": c.get("net_pnl"),
                    "current_trades": c.get("trades"),
                    "top_return_pct": t.get("return_pct"),
                    "top_net_pnl": t.get("net_pnl"),
                    "top_trades": t.get("trades"),
                    "delta_net_pnl": round((t.get("net_pnl") or 0) - (c.get("net_pnl") or 0), 2),
                    "delta_return_pct": round((t.get("return_pct") or 0) - (c.get("return_pct") or 0), 4),
                }
            )
        fc, ft = current["full_chained"], top["full_chained"]
        rows.append(
            {
                "year": "full_chained",
                "current_return_pct": fc.get("return_pct"),
                "current_net_pnl": fc.get("net_pnl"),
                "current_trades": fc.get("trades"),
                "top_return_pct": ft.get("return_pct"),
                "top_net_pnl": ft.get("net_pnl"),
                "top_trades": ft.get("trades"),
                "delta_net_pnl": round((ft.get("net_pnl") or 0) - (fc.get("net_pnl") or 0), 2),
                "delta_return_pct": round((ft.get("return_pct") or 0) - (fc.get("return_pct") or 0), 4),
            }
        )
        return rows

    out = {
        "period": period_label,
        "note": "Isolated year rows = fresh $1000 each slice. full_chained = one account over entire range.",
        "best_from_exit_sweep": {"london": best_london_id, "fade": best_fade_id},
        "london": {"current": london_current, "top_winner": london_top, "comparison": delta_rows(london_current, london_top)},
        "fade": {"current": fade_current, "top_winner": fade_top, "comparison": delta_rows(fade_current, fade_top)},
    }

    path = ROOT / "out/reports/top-exit-vs-current-5y.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(out, indent=2))
    print(f"\nWrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
