#!/usr/bin/env python3
"""Research: would VWAP / volume-profile filters improve trades? (no strategy code changes)."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from aar.backtest.engine import run_backtest
from aar.config import load_config
from aar.core.models import Trade
from aar.core.sessions import LONDON_START, NEW_YORK_START, ms_to_ist_date
from aar.data.vision import load_klines
from aar.research.session_metrics import candles_in_range, ist_session_start_ms, profile_from_candles

# Filter ids -> human name
FILTERS = {
    "baseline": "All trades (no filter)",
    "vwap_aligned": "Long above session VWAP, short below",
    "vwap_stretch_0.15pct": "Entry at least 0.15% away from session VWAP",
    "poc_aligned": "Long above POC, short below POC",
    "inside_value_area": "Entry inside 70% value area",
    "outside_value_area": "Entry outside value area (initiative)",
    "combo_london": "vwap_aligned + poc_aligned + inside_value_area",
    "combo_fade": "vwap_stretch_0.15pct + outside_value_area + vwap_aligned",
}


def _stats(trades: list[Trade]) -> dict:
    n = len(trades)
    if n == 0:
        return {"trades": 0, "win_rate_pct": 0.0, "net_pnl_usd": 0.0, "avg_net_usd": 0.0}
    wins = sum(1 for t in trades if t.net_pnl > 0)
    net = sum(t.net_pnl for t in trades)
    return {
        "trades": n,
        "win_rate_pct": round(100.0 * wins / n, 2),
        "net_pnl_usd": round(net, 2),
        "avg_net_usd": round(net / n, 2),
    }


def _load_day_candles(cfg, day: date) -> list:
    start = day - timedelta(days=1)
    end = day + timedelta(days=2)
    return load_klines(cfg.symbol, cfg.interval, start, end, cfg.cache_dir, require_data=False)


def _passes_filter(fid: str, m: dict) -> bool:
    side = m["side"]
    if fid == "baseline":
        return True
    if fid == "vwap_aligned":
        return m["above_vwap"] if side == "long" else not m["above_vwap"]
    if fid == "vwap_stretch_0.15pct":
        return m["stretch_from_vwap_pct"] >= 0.15
    if fid == "poc_aligned":
        return m["above_poc"] if side == "long" else not m["above_poc"]
    if fid == "inside_value_area":
        return m["inside_va"]
    if fid == "outside_value_area":
        return not m["inside_va"]
    if fid == "combo_london":
        return (
            _passes_filter("vwap_aligned", m)
            and _passes_filter("poc_aligned", m)
            and _passes_filter("inside_value_area", m)
        )
    if fid == "combo_fade":
        return (
            _passes_filter("vwap_stretch_0.15pct", m)
            and _passes_filter("outside_value_area", m)
            and _passes_filter("vwap_aligned", m)
        )
    return True


def analyze_config(cfg_path: Path, filter_ids: list[str]) -> dict:
    cfg = load_config(cfg_path)
    bt = cfg.section("backtest")
    start = date.fromisoformat(bt["start"])
    end = date.fromisoformat(bt["end"])
    result = run_backtest(cfg, start, end)
    strategy = cfg.strategy_name
    day_cache: dict[date, list] = {}

    def metrics_for(trade: Trade) -> dict | None:
        day = ms_to_ist_date(trade.entry_time_ms)
        if day not in day_cache:
            day_cache[day] = _load_day_candles(cfg, day)
        candles = day_cache[day]
        if not candles:
            return None
        tick = float(cfg.raw["market"].get("tick_size", 1.0))
        if strategy == "london-mid-engulf":
            start_ms = ist_session_start_ms(day, LONDON_START)
        else:
            start_ms = ist_session_start_ms(day, NEW_YORK_START)
        sess = candles_in_range(candles, start_ms, trade.entry_time_ms + 1)
        prof = profile_from_candles(sess, tick=tick)
        if prof is None:
            return None
        ep = trade.entry_price
        side = trade.side
        stretch = abs(ep - prof.vwap) / prof.vwap if prof.vwap else 0.0
        return {
            "entry_ms": trade.entry_time_ms,
            "side": side,
            "entry_price": ep,
            "net_pnl": trade.net_pnl,
            "vwap": prof.vwap,
            "poc": prof.poc,
            "va_low": prof.va_low,
            "va_high": prof.va_high,
            "stretch_from_vwap_pct": round(stretch * 100, 4),
            "above_vwap": ep > prof.vwap,
            "above_poc": ep > prof.poc,
            "inside_va": prof.va_low <= ep <= prof.va_high,
        }

    paired: list[tuple[Trade, dict]] = []
    for t in result.trades:
        m = metrics_for(t)
        if m is not None:
            paired.append((t, m))

    baseline_trades = result.trades
    out_filters = {}
    for fid in filter_ids:
        kept = [t for t, m in paired if _passes_filter(fid, m)]
        removed = len(baseline_trades) - len(kept)
        losers_removed = sum(1 for t in baseline_trades if t.net_pnl < 0) - sum(
            1 for t in kept if t.net_pnl < 0
        )
        out_filters[fid] = {
            "label": FILTERS.get(fid, fid),
            **_stats(kept),
            "trades_removed": removed,
            "losers_removed": losers_removed,
            "retention_pct": round(100.0 * len(kept) / len(baseline_trades), 1) if baseline_trades else 0,
        }

    return {
        "config": str(cfg_path),
        "strategy": strategy,
        "period": f"{start} .. {end}",
        "baseline": _stats(baseline_trades),
        "trades_with_metrics": len(paired),
        "trades_missing_metrics": len(baseline_trades) - len(paired),
        "filters": out_filters,
        "note": "Research only — production strategies unchanged.",
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--configs",
        default="fade=config.btc.fade-reversal-ny-trend.toml,london=config.btc.london-mid-engulf-winner.toml",
    )
    ap.add_argument("--json-out", type=Path, default=ROOT / "out/reports/microstructure-research.json")
    args = ap.parse_args()

    fade_filters = [
        "baseline",
        "vwap_aligned",
        "vwap_stretch_0.15pct",
        "poc_aligned",
        "inside_value_area",
        "outside_value_area",
        "combo_fade",
    ]
    london_filters = [
        "baseline",
        "vwap_aligned",
        "poc_aligned",
        "inside_value_area",
        "outside_value_area",
        "combo_london",
    ]

    reports = []
    for part in args.configs.split(","):
        part = part.strip()
        if not part:
            continue
        if ":" in part:
            name, path = part.split(":", 1)
        elif "=" in part:
            name, path = part.split("=", 1)
        else:
            name, path = part, part
        cfg_path = ROOT / path.strip()
        fids = london_filters if "london" in name.lower() or "london" in path else fade_filters
        print(f"Analyzing {cfg_path} ...", flush=True)
        reports.append(analyze_config(cfg_path, fids))

    payload = {"reports": reports}
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(payload, indent=2))
    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
