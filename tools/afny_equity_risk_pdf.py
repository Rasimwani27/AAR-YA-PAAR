#!/usr/bin/env python3
"""AFNY equity curve, drawdown, trade stats (fees / slippage / funding) — PDF."""

from __future__ import annotations

import copy
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import tomllib
from matplotlib.backends.backend_pdf import PdfPages

from aar.backtest.engine import run_backtest
from aar.backtest.trade_stats import summarize_trades
from aar.config import AppConfig

CONFIG = ROOT / "config.btc.fade-reversal-ny-trend.toml"  # sole production strategy
OUT_PDF = ROOT / "out/reports/AFNY-equity-risk-report.pdf"
OUT_JSON = ROOT / "out/reports/AFNY-equity-risk-metrics.json"


def ms_to_dt(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


def compute_risk_metrics(initial: float, trades: list) -> dict:
    if not trades:
        return {"error": "no trades"}

    points: list[tuple[datetime, float]] = [(ms_to_dt(trades[0].entry_time_ms), initial)]
    equity = initial
    peak_eq = initial
    peak_time = points[0][0]
    max_dd_usd = 0.0
    max_dd_pct = 0.0
    trough_time = peak_time
    dd_peak_time = peak_time
    peak_at_max_dd = initial

    for t in sorted(trades, key=lambda x: x.exit_time_ms):
        equity += t.net_pnl
        dt = ms_to_dt(t.exit_time_ms)
        points.append((dt, equity))
        if equity >= peak_eq:
            peak_eq = equity
            peak_time = dt
        dd = peak_eq - equity
        if dd > max_dd_usd:
            max_dd_usd = dd
            max_dd_pct = (dd / peak_eq * 100) if peak_eq else 0
            trough_time = dt
            dd_peak_time = peak_time
            peak_at_max_dd = peak_eq

    recovery_time_days: float | None = None
    recovery_dt: datetime | None = None
    for dt, eq in points:
        if dt <= trough_time:
            continue
        if eq >= peak_at_max_dd:
            recovery_dt = dt
            recovery_time_days = (dt - trough_time).total_seconds() / 86400
            break

    streak = 0
    max_streak = 0
    max_streak_loss = 0.0
    streak_loss = 0.0
    for t in sorted(trades, key=lambda x: x.exit_time_ms):
        if t.net_pnl < 0:
            streak += 1
            streak_loss += t.net_pnl
            if streak > max_streak:
                max_streak = streak
                max_streak_loss = streak_loss
        else:
            streak = 0
            streak_loss = 0.0

    return {
        "initial_equity": initial,
        "final_equity": round(points[-1][1], 2),
        "max_drawdown_usd": round(max_dd_usd, 2),
        "max_drawdown_pct": round(max_dd_pct, 2),
        "max_dd_peak_time_utc": dd_peak_time.isoformat(),
        "max_dd_trough_time_utc": trough_time.isoformat(),
        "recovery_time_days_after_max_dd": round(recovery_time_days, 1)
        if recovery_time_days is not None
        else None,
        "recovery_time_utc": recovery_dt.isoformat() if recovery_dt else "not_recovered_in_sample",
        "longest_losing_streak_trades": max_streak,
        "longest_losing_streak_net_usd": round(max_streak_loss, 2),
        "equity_points": [{"t": p[0].isoformat(), "equity": round(p[1], 2)} for p in points],
    }


def run_scenario(label: str, raw: dict, start: date, end: date, initial: float) -> dict:
    cfg = AppConfig(raw=raw, path=CONFIG)
    bt = raw["backtest"]
    slip_bps = float(bt.get("slippage_bps_per_fill", 0))
    slip_usd = float(bt.get("slippage_usdt_per_fill", 0))
    cost_note = (
        f"Fees {bt.get('taker_fee', 0)*float(bt.get('fee_discount',1)):.4%}/side taker; "
        f"slippage ${slip_usd:.0f}/fill + {slip_bps:.1f}bps notional; "
        f"funding {'on @ '+str(bt.get('funding_rate'))+'/8h pro-rata' if bt.get('use_real_funding') else 'off'}"
    )
    res = run_backtest(cfg, start, end)
    stats = summarize_trades(res.trades, cost_note=cost_note)
    risk = compute_risk_metrics(initial, res.trades)
    return {
        "label": label,
        "summary": res.summary(),
        "trade_stats": stats,
        "risk": {k: v for k, v in risk.items() if k != "equity_points"},
        "equity_points": risk.get("equity_points", []),
    }


def build_pdf(primary: dict, realistic: dict, start: str, end: str) -> None:
    OUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    times = [datetime.fromisoformat(p["t"]) for p in primary["equity_points"]]
    equity = [p["equity"] for p in primary["equity_points"]]
    peak = equity[0]
    dd_pct = []
    for eq in equity:
        if eq > peak:
            peak = eq
        dd_pct.append(-((peak - eq) / peak * 100) if peak else 0)

    ts = primary["trade_stats"]
    ts2 = realistic["trade_stats"]

    with PdfPages(OUT_PDF) as pdf:
        fig, axes = plt.subplots(2, 1, figsize=(11, 8.5), height_ratios=[2.5, 1])
        fig.suptitle("AFNY — Equity & Drawdown (fees-only baseline)", fontsize=14, fontweight="bold")
        axes[0].plot(times, equity, color="#2563eb", linewidth=1.8)
        axes[0].set_ylabel("Equity ($)")
        axes[0].grid(True, alpha=0.3)
        axes[0].xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
        axes[0].set_title(f"{start} → {end} · {CONFIG.name}")
        axes[1].fill_between(times, dd_pct, 0, color="#dc2626", alpha=0.5)
        axes[1].set_ylabel("Drawdown (%)")
        axes[1].set_xlabel("UTC (at trade exit)")
        axes[1].grid(True, alpha=0.3)
        plt.tight_layout()
        pdf.savefig(fig, bbox_inches="tight")
        plt.close(fig)

        def stats_block(s: dict, r: dict) -> str:
            return f"""
{s['label']}
  Costs: {s['trade_stats']['cost_note']}

  Trades: {s['trade_stats']['trade_count']}  |  Wins: {s['trade_stats']['winning_trades']}  |  Losses: {s['trade_stats']['losing_trades']}
  Win rate: {s['trade_stats']['win_rate_pct']}%
  Profit factor (net): {s['trade_stats']['profit_factor_net']}
  Expectancy / trade: ${s['trade_stats']['expectancy_usd_per_trade']}
  Avg winning trade: ${s['trade_stats']['avg_winning_trade_usd']} ({s['trade_stats']['avg_winning_trade_pct_notional']}% notional)
  Avg losing trade: ${s['trade_stats']['avg_losing_trade_usd']} ({s['trade_stats']['avg_losing_trade_pct_notional']}% notional)

  Gross PnL (before costs): ${s['trade_stats']['total_gross_pnl_before_costs']}
  Fees: ${s['trade_stats']['total_fees_usd']}  |  Slippage: ${s['trade_stats']['total_slippage_usd']}  |  Funding: ${s['trade_stats']['total_funding_usd']}
  Total costs: ${s['trade_stats']['total_costs_usd']}  |  Net PnL: ${s['trade_stats']['total_net_pnl_usd']}
  Final equity: ${r['final_equity']}  |  Max DD: ${r['max_drawdown_usd']} ({r['max_drawdown_pct']}%)
  Longest losing streak: {r['longest_losing_streak_trades']} trades (${r['longest_losing_streak_net_usd']})
"""

        fig2 = plt.figure(figsize=(11, 8.5))
        body = (
            "AFNY — Trade statistics & costs\n\n"
            + stats_block(primary, primary["risk"])
            + "\n--- Realistic overlay (same rules) ---\n"
            + stats_block(realistic, realistic["risk"])
            + "\nReproduce: python3 tools/afny_equity_risk_pdf.py\n"
            "Slippage: fixed USD per entry + exit fill. Funding: pro-rated per bar vs 8h rate on notional."
        )
        fig2.text(0.06, 0.95, body, transform=fig2.transFigure, fontsize=9, verticalalignment="top", family="monospace")
        pdf.savefig(fig2, bbox_inches="tight")
        plt.close(fig2)

    print(f"Wrote {OUT_PDF}")


def main() -> int:
    with CONFIG.open("rb") as f:
        base = tomllib.load(f)
    bt = base["backtest"]
    start = date.fromisoformat(bt["start"])
    end = date.fromisoformat(bt["end"])
    initial = float(bt.get("initial_equity", 1000.0))

    raw_fees = copy.deepcopy(base)
    raw_fees["backtest"]["slippage_usdt_per_fill"] = 0.0
    raw_fees["backtest"]["use_real_funding"] = False

    raw_real = copy.deepcopy(base)
    raw_real["backtest"]["slippage_usdt_per_fill"] = 0.0
    raw_real["backtest"]["slippage_bps_per_fill"] = 2.0
    raw_real["backtest"]["use_real_funding"] = True

    primary = run_scenario("Baseline (fees only)", raw_fees, start, end, initial)
    realistic = run_scenario("All-in (fees + 2bps/fill slip + funding)", raw_real, start, end, initial)

    out = {
        "config": str(CONFIG),
        "start": str(start),
        "end": str(end),
        "baseline": {k: primary[k] for k in ("label", "summary", "trade_stats", "risk")},
        "realistic": {k: realistic[k] for k in ("label", "summary", "trade_stats", "risk")},
    }
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(out, indent=2))
    build_pdf(primary, realistic, str(start), str(end))
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
