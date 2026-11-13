#!/usr/bin/env python3
"""Grid search stop_usdt and reward_risk for london-mid-engulf (one signal pass)."""

from __future__ import annotations

import copy
import json
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import aar.strategies  # noqa: F401
from aar.backtest.engine import (  # noqa: E402
    OpenPosition,
    _check_exit,
    _cost_params,
    _date_ms,
    _fee_rate,
    _fill_slippage_usd,
    _gross,
    _position_size,
)
from aar.config import AppConfig, load_config  # noqa: E402
from aar.core.models import Candle, Signal, Trade
from aar.core.rules import create_strategy
from aar.core.sessions import in_london, in_observation, ms_to_ist_date, ms_to_ist_time, OBSERVATION_START
from aar.data.vision import load_klines
from aar.strategies.break_fade import build_levels_for_day
from aar.strategies.london_mid_engulf import LondonMidEngulfStrategy


def _collect_signals(cfg: AppConfig, start: date, end: date) -> tuple[list[Candle], list[tuple[int, Signal]]]:
    """Return exec candles and (bar_index, signal) entries; signals independent of stop/rr."""
    start_ms = _date_ms(start)
    end_ms = _date_ms(end)
    raw_exec = load_klines(cfg.symbol, cfg.interval, start, end, cfg.cache_dir, require_data=True)
    exec_candles = [c for c in raw_exec if start_ms <= c.open_time_ms < end_ms]

    pad = start - timedelta(days=2)
    level_candles = load_klines(cfg.symbol, cfg.level_interval, pad, end, cfg.cache_dir, require_data=False)
    anchor_candles = load_klines(cfg.symbol, cfg.anchor_interval, pad, end, cfg.cache_dir, require_data=False)

    strategy = create_strategy(cfg)
    if not isinstance(strategy, LondonMidEngulfStrategy):
        raise TypeError("expected london-mid-engulf")

    ema_obs_by_day: dict[date, list[float]] = {}
    level_obs_by_day: dict[date, list[Candle]] = {}
    anchor_price_by_day: dict[date, float] = {}
    for ec in level_candles:
        if in_observation(ec.open_time_ms):
            d = ms_to_ist_date(ec.open_time_ms)
            ema_obs_by_day.setdefault(d, []).append(ec.close)
    for lc in level_candles:
        if in_observation(lc.open_time_ms):
            d = ms_to_ist_date(lc.open_time_ms)
            level_obs_by_day.setdefault(d, []).append(lc)
    for ac in anchor_candles:
        if ms_to_ist_time(ac.open_time_ms) == OBSERVATION_START:
            anchor_price_by_day[ms_to_ist_date(ac.open_time_ms)] = ac.close

    signals: list[tuple[int, Signal]] = []
    current_day: date | None = None
    for i, c in enumerate(exec_candles):
        day = ms_to_ist_date(c.open_time_ms)
        if day != current_day:
            current_day = day
            levels = build_levels_for_day(
                cfg,
                day,
                level_candles,
                anchor_candles,
                obs_candles=level_obs_by_day.get(day),
                anchor_price=anchor_price_by_day.get(day),
            )
            strategy.on_day_levels(levels)
        sig = strategy.on_candle(c, in_trading_window=True)
        if isinstance(sig, Signal):
            # Normalize: strip stop/target from signal; sim applies grid
            signals.append(
                (
                    i,
                    Signal(
                        side=sig.side,
                        entry_price=sig.entry_price,
                        stop_dist=0.0,
                        target_dist=0.0,
                        reason=sig.reason,
                        max_hold_bars=sig.max_hold_bars,
                    ),
                )
            )
    return exec_candles, signals


def _simulate(
    exec_candles: list[Candle],
    signals: list[tuple[int, Signal]],
    cfg: AppConfig,
    stop: float,
    rr: float,
) -> dict:
    bt = cfg.section("backtest")
    initial = float(bt.get("initial_equity", 1000.0))
    fee_rate = _fee_rate(cfg)
    slip_usd, slip_bps, use_funding, funding_rate, exec_bar_ms = _cost_params(cfg)
    strategy = create_strategy(cfg)
    if not isinstance(strategy, LondonMidEngulfStrategy):
        raise TypeError("expected london-mid-engulf")

    target = stop * rr
    equity = initial
    base_equity = initial
    trades: list[Trade] = []
    position: OpenPosition | None = None
    sig_idx = 0

    for i, c in enumerate(exec_candles):
        while sig_idx < len(signals) and signals[sig_idx][0] < i:
            sig_idx += 1

        if position is not None:
            position.bars_held += 1
            if use_funding:
                from aar.backtest.engine import _accrue_funding

                fp = _accrue_funding(position, c.close, funding_rate, exec_bar_ms)
                position.funding_paid += fp
                equity -= fp
            hit = _check_exit(position, c)
            if hit is None and position.max_hold_bars and position.bars_held >= position.max_hold_bars:
                hit = (c.close, "time")
            if hit:
                exit_p, reason = hit
                exit_fee = fee_rate * position.qty * exit_p
                exit_slip = _fill_slippage_usd(position.qty, exit_p, slip_usd, slip_bps)
                gross = _gross(position.side, position.entry_price, exit_p, position.qty)
                fees = position.entry_fee + exit_fee
                slip_total = position.entry_slippage + exit_slip
                net = gross - fees - slip_total - position.funding_paid
                equity += gross - exit_fee - exit_slip
                trades.append(
                    Trade(
                        position.entry_time_ms,
                        c.open_time_ms,
                        position.side,
                        position.entry_price,
                        exit_p,
                        position.qty,
                        gross,
                        fees,
                        net,
                        reason,
                        slippage=slip_total,
                        funding=position.funding_paid,
                    )
                )
                position = None

        if sig_idx < len(signals) and signals[sig_idx][0] == i:
            _, sig = signals[sig_idx]
            sig_idx += 1
            if position is None:
                qty = _position_size(equity, strategy.risk_pct(), stop, strategy.compound(), base_equity)
                if qty > 0:
                    entry_fee = fee_rate * qty * sig.entry_price
                    entry_slip = _fill_slippage_usd(qty, sig.entry_price, slip_usd, slip_bps)
                    if equity > entry_fee + entry_slip:
                        equity -= entry_fee + entry_slip
                        position = OpenPosition(
                            sig.side,
                            sig.entry_price,
                            qty,
                            stop,
                            target,
                            c.open_time_ms,
                            entry_fee,
                            sig.reason,
                            max_hold_bars=sig.max_hold_bars,
                        )

    net_pnl = equity - initial
    ret = (equity / initial - 1.0) * 100.0 if initial else 0.0
    wins = sum(1 for t in trades if t.net_pnl > 0)
    wr = wins / len(trades) if trades else 0.0
    return {
        "stop_usdt": stop,
        "reward_risk": rr,
        "trades": len(trades),
        "win_rate": round(wr, 4),
        "net_pnl": round(net_pnl, 2),
        "return_pct": round(ret, 4),
        "final_equity": round(equity, 2),
    }


def main() -> None:
    cfg_path = ROOT / "config.btc.london-mid-engulf.toml"
    base = load_config(cfg_path)
    raw = copy.deepcopy(base.raw)
    raw["strategy"]["london_mid_engulf"]["inverse"] = False
    base = AppConfig(raw=raw, path=cfg_path)

    bt = base.section("backtest")
    start = date.fromisoformat(str(bt["start"]))
    end = date.fromisoformat(str(bt["end"]))

    print("Collecting signals (one pass)...", flush=True)
    exec_candles, signals = _collect_signals(base, start, end)
    print(f"Signals: {len(signals)}, bars: {len(exec_candles)}", flush=True)

    stops = list(range(100, 501, 50))
    rrs = list(range(1, 21))
    rows: list[dict] = []
    best_net: dict | None = None
    best_ret: dict | None = None
    total = len(stops) * len(rrs)
    n = 0

    for stop in stops:
        for rr in rrs:
            n += 1
            row = _simulate(exec_candles, signals, base, float(stop), float(rr))
            rows.append(row)
            if best_net is None or row["net_pnl"] > best_net["net_pnl"]:
                best_net = row
            if best_ret is None or row["return_pct"] > best_ret["return_pct"]:
                best_ret = row
            print(
                f"[{n}/{total}] stop={stop} rr=1:{rr} net={row['net_pnl']} ret={row['return_pct']}% wr={row['win_rate']}",
                flush=True,
            )

    # Top 10 by net_pnl
    top = sorted(rows, key=lambda r: r["net_pnl"], reverse=True)[:10]

    out = {
        "config": str(cfg_path),
        "start": str(start),
        "end": str(end),
        "inverse": False,
        "stop_grid_usd": stops,
        "reward_risk_grid": rrs,
        "signal_count": len(signals),
        "best_by_net_pnl": best_net,
        "best_by_return_pct": best_ret,
        "top10_by_net_pnl": top,
        "rows": rows,
    }
    report_path = ROOT / "out/reports/london-mid-engulf-rr-sl-sweep.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print("\nWrote", report_path)
    print("Best net_pnl:", json.dumps(best_net, indent=2))
    print("Top 10:", json.dumps(top, indent=2))


if __name__ == "__main__":
    main()
