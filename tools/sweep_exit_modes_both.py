#!/usr/bin/env python3
"""Compare exit styles for london-mid-engulf and fade-reversal (research only; does not edit configs)."""

from __future__ import annotations

import copy
import json
import sys
from collections import Counter
from dataclasses import asdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import aar.strategies  # noqa: F401
from aar.backtest.engine import run_backtest
from aar.config import load_config


def _trailing_block(
    *,
    enabled: bool,
    mode: str = "breakeven",
    be_trigger: float = 200,
    use_target: bool = True,
    trail_buffer: float = 25,
    max_trail: float = 0,
    swing: str = "exec",
) -> dict:
    return {
        "enabled": enabled,
        "mode": mode,
        "be_trigger_usd": be_trigger,
        "be_offset_usd": 0.0,
        "trail_buffer_usd": trail_buffer,
        "max_trail_usd": max_trail,
        "use_target": use_target,
        "pivot_bars": 1,
        "swing_interval": swing,
    }


def scenario_grid() -> list[dict]:
    """Named exit research scenarios (fixed / dynamic SL / TP combinations)."""
    s: list[dict] = []

    def add(scenario_id: str, desc: str, trail: dict):
        s.append({"id": scenario_id, "description": desc, "trailing": trail})

    add("A1_fixed_sl_fixed_tp", "Fixed SL + fixed TP (no trail)", _trailing_block(enabled=False))

    add(
        "B1_dyn_sl_fixed_tp_be200",
        "Dynamic SL (BE@200) + fixed TP [London current-ish]",
        _trailing_block(enabled=True, mode="breakeven", be_trigger=200, use_target=True),
    )
    add(
        "B2_dyn_sl_fixed_tp_be400",
        "Dynamic SL (BE@400) + fixed TP - hold longer before BE",
        _trailing_block(enabled=True, mode="breakeven", be_trigger=400, use_target=True),
    )
    add(
        "B3_dyn_sl_fixed_tp_be0",
        "Dynamic SL (BE@0=1x stop) + fixed TP - later BE",
        _trailing_block(enabled=True, mode="breakeven", be_trigger=0, use_target=True),
    )

    add(
        "C1_fixed_sl_dyn_tp_no_target",
        "Fixed initial SL + dynamic TP (swing trail, no fixed target)",
        _trailing_block(enabled=True, mode="last_low", be_trigger=400, use_target=False, trail_buffer=25),
    )
    add(
        "C2_fixed_sl_dyn_tp_staged",
        "Fixed SL + staged trail, no fixed target cap",
        _trailing_block(enabled=True, mode="staged", be_trigger=200, use_target=False, trail_buffer=50),
    )

    add(
        "D1_dyn_sl_dyn_tp_be_swing",
        "Dynamic SL (BE) + dynamic TP (swing, no cap)",
        _trailing_block(enabled=True, mode="last_low", be_trigger=200, use_target=False, trail_buffer=25),
    )
    add(
        "D2_dyn_sl_dyn_tp_prev_swing",
        "Dynamic SL/TP prev swing, BE@200, no fixed TP",
        _trailing_block(enabled=True, mode="prev_last_low", be_trigger=200, use_target=False, trail_buffer=25),
    )

    add(
        "E1_cut_early",
        "Cut early: BE arms at 100, fixed TP",
        _trailing_block(enabled=True, mode="breakeven", be_trigger=100, use_target=True),
    )
    add(
        "E2_hold_longer",
        "Hold longer: no trail until BE@800, fixed TP",
        _trailing_block(enabled=True, mode="breakeven", be_trigger=800, use_target=True),
    )
    add(
        "F1_no_be_full_stop",
        "No dynamic SL (trail off) - pure fixed SL/TP only",
        _trailing_block(enabled=False),
    )

    return s


def _apply_trailing_london(cfg: dict, trail: dict) -> None:
    cfg.setdefault("strategy", {}).setdefault("london_mid_engulf", {})["trailing"] = copy.deepcopy(trail)


def _apply_trailing_fade(cfg: dict, trail: dict) -> None:
    cfg.setdefault("backtest", {})["trailing"] = copy.deepcopy(trail)


def _run_one(cfg_path: Path, patch_trailing, strategy_key: str) -> dict:
    raw = copy.deepcopy(load_config(cfg_path).raw)
    patch_trailing(raw)
    from aar.config import AppConfig

    cfg = AppConfig(raw=raw, path=cfg_path)
    bt = cfg.section("backtest")
    start = date.fromisoformat(str(bt["start"]))
    end = date.fromisoformat(str(bt["end"]))
    r = run_backtest(cfg, start, end)
    trades = [asdict(t) for t in r.trades]
    exit_c = Counter(t["exit_reason"] for t in trades)
    wins = [t for t in trades if t["net_pnl"] > 0]
    losses = [t for t in trades if t["net_pnl"] < 0]
    med_min = lambda xs: (
        sorted((t["exit_time_ms"] - t["entry_time_ms"]) / 60000 for t in xs)[len(xs) // 2] if xs else 0
    )
    return {
        **r.summary(),
        "exit_reasons": dict(exit_c),
        "median_hold_min_wins": round(med_min(wins), 1),
        "median_hold_min_losses": round(med_min(losses), 1),
        "targets_hit": exit_c.get("target", 0),
        "stops_hit": exit_c.get("stop", 0),
        "trail_stops": exit_c.get("trail_stop", 0),
    }


def main() -> int:
    scenarios = scenario_grid()
    london_cfg = ROOT / "config.btc.london-mid-engulf-winner.toml"
    fade_cfg = ROOT / "config.btc.fade-reversal-ny-trend.toml"

    out: dict = {"scenarios": [x["id"] for x in scenarios], "london": [], "fade": []}

    for sc in scenarios:
        print(f"London {sc['id']}...", flush=True)
        row = {
            "scenario_id": sc["id"],
            "description": sc["description"],
            **_run_one(london_cfg, lambda r: _apply_trailing_london(r, sc["trailing"]), "london"),
        }
        out["london"].append(row)

    for sc in scenarios:
        print(f"Fade {sc['id']}...", flush=True)
        row = {
            "scenario_id": sc["id"],
            "description": sc["description"],
            **_run_one(fade_cfg, lambda r: _apply_trailing_fade(r, sc["trailing"]), "fade"),
        }
        out["fade"].append(row)

    def best(rows: list[dict]) -> dict:
        if not rows:
            return {}
        b = max(rows, key=lambda x: x["net_pnl"])
        return {"scenario_id": b["scenario_id"], "net_pnl": b["net_pnl"], "return_pct": b["return_pct"]}

    out["best_london"] = best(out["london"])
    out["best_fade"] = best(out["fade"])

    path = ROOT / "out/reports/exit-modes-both-strategies.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print("Wrote", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
