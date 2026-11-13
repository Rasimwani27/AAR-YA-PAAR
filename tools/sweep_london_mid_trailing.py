#!/usr/bin/env python3
"""Full grid: all trailing modes, BE triggers, buffers, max trail, 3m/15m swings."""

from __future__ import annotations

import copy
import itertools
import json
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import aar.strategies  # noqa: F401
from aar.backtest.engine import (  # noqa: E402
    OpenPosition,
    _accrue_funding,
    _check_exit,
    _cost_params,
    _date_ms,
    _fee_rate,
    _fill_slippage_usd,
    _gross,
    _position_size,
)
from aar.backtest.trailing import (  # noqa: E402
    TrailingConfig,
    init_trailing_state,
    register_swing,
    trailing_config_from_raw,
    update_trailing,
)
from aar.config import AppConfig, load_config
from aar.core.models import Candle, Signal, Trade
from aar.core.rules import create_strategy
from aar.core.sessions import in_observation, ms_to_ist_date, ms_to_ist_time, OBSERVATION_START
from aar.data.vision import load_klines
from aar.strategies.break_fade import build_levels_for_day
from aar.strategies.london_mid_engulf import LondonMidEngulfStrategy
from tools.sweep_london_mid_rr_sl import _collect_signals  # noqa: E402


def _simulate(
    exec_candles: list[Candle],
    swing_15m: list[Candle],
    signals: list[tuple[int, Signal]],
    cfg: AppConfig,
    trail_raw: dict,
    stop_usdt: float,
    rr: float,
) -> dict:
    trail_cfg = trailing_config_from_raw(trail_raw)
    bt = cfg.section("backtest")
    initial = float(bt.get("initial_equity", 1000.0))
    fee_rate = _fee_rate(cfg)
    slip_usd, slip_bps, use_funding, funding_rate, exec_bar_ms = _cost_params(cfg)
    strategy = create_strategy(cfg)
    if not isinstance(strategy, LondonMidEngulfStrategy):
        raise TypeError("expected london-mid-engulf")

    target_dist = stop_usdt * rr if not (trail_cfg.enabled and not trail_cfg.use_target) else stop_usdt * rr
    if trail_cfg.enabled and not trail_cfg.use_target:
        target_dist = 0.0

    equity = initial
    base_equity = initial
    trades: list[Trade] = []
    position: OpenPosition | None = None
    sig_idx = 0
    swing_15m_idx = 0
    exits: dict[str, int] = {}

    for i, c in enumerate(exec_candles):
        while sig_idx < len(signals) and signals[sig_idx][0] < i:
            sig_idx += 1

        if position is not None:
            position.bars_held += 1
            if use_funding:
                fp = _accrue_funding(position, c.close, funding_rate, exec_bar_ms)
                position.funding_paid += fp
                equity -= fp
            if trail_cfg.enabled and position.trailing is not None:
                if position.bar_history is not None:
                    position.bar_history.append(c)
                if trail_cfg.swing_interval == "15m" and position.swing_bar_history is not None:
                    while swing_15m_idx < len(swing_15m) and swing_15m[swing_15m_idx].open_time_ms <= c.open_time_ms:
                        bc = swing_15m[swing_15m_idx]
                        swing_15m_idx += 1
                        if bc.open_time_ms >= position.entry_time_ms:
                            position.swing_bar_history.append(bc)
                            register_swing(
                                position.trailing,
                                position.side,
                                position.swing_bar_history,
                                trail_cfg.pivot_bars,
                            )
                elif position.bar_history is not None:
                    register_swing(
                        position.trailing,
                        position.side,
                        position.bar_history,
                        trail_cfg.pivot_bars,
                    )
                update_trailing(position.trailing, position.side, position.entry_price, c, trail_cfg)

            hit = _check_exit(position, c, trail_cfg)
            if hit is None and position.max_hold_bars and position.bars_held >= position.max_hold_bars:
                hit = (c.close, "time")
            if hit:
                exit_p, reason = hit
                exit_fee = fee_rate * position.qty * exit_p
                exit_slip = _fill_slippage_usd(position.qty, exit_p, slip_usd, slip_bps)
                gross = _gross(position.side, position.entry_price, exit_p, position.qty)
                fees = position.entry_fee + exit_fee
                net = gross - fees - position.entry_slippage - exit_slip - position.funding_paid
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
                    )
                )
                exits[reason] = exits.get(reason, 0) + 1
                position = None

        if sig_idx < len(signals) and signals[sig_idx][0] == i:
            _, sig = signals[sig_idx]
            sig_idx += 1
            if position is None:
                qty = _position_size(equity, strategy.risk_pct(), stop_usdt, strategy.compound(), base_equity)
                if qty > 0:
                    entry_fee = fee_rate * qty * sig.entry_price
                    entry_slip = _fill_slippage_usd(qty, sig.entry_price, slip_usd, slip_bps)
                    if equity > entry_fee + entry_slip:
                        equity -= entry_fee + entry_slip
                        t_state = init_trailing_state(sig.side, sig.entry_price, stop_usdt) if trail_cfg.enabled else None
                        td = target_dist
                        position = OpenPosition(
                            sig.side,
                            sig.entry_price,
                            qty,
                            stop_usdt,
                            td,
                            c.open_time_ms,
                            entry_fee,
                            sig.reason,
                            entry_slippage=entry_slip,
                            trailing=t_state,
                            bar_history=[c] if trail_cfg.enabled else None,
                            swing_bar_history=[] if trail_cfg.enabled and trail_cfg.swing_interval == "15m" else None,
                        )

    net_pnl = equity - initial
    ret = (equity / initial - 1.0) * 100.0 if initial else 0.0
    wins = sum(1 for t in trades if t.net_pnl > 0)
    wr = wins / len(trades) if trades else 0.0
    return {
        "trades": len(trades),
        "win_rate": round(wr, 4),
        "net_pnl": round(net_pnl, 2),
        "return_pct": round(ret, 4),
        "final_equity": round(equity, 2),
        "exit_reasons": exits,
    }


def iter_configs() -> list[dict]:
    be_triggers = [0, 200, 400, 800]
    max_trails = [0, 100, 200, 300, 400, 500]
    use_targets = [True, False]
    buffers = [10, 25, 50, 100, 150]
    pivots = [1, 2, 3]
    swings = ["exec", "15m"]

    out: list[dict] = []
    out.append({"enabled": False, "use_target": True, "label": "fixed_baseline"})

    for be, max_t, ut in itertools.product(be_triggers, max_trails, use_targets):
        out.append(
            {
                "enabled": True,
                "mode": "breakeven",
                "be_trigger_usd": float(be),
                "be_offset_usd": 0.0,
                "max_trail_usd": float(max_t),
                "use_target": ut,
                "label": "breakeven",
            }
        )

    for mode in ("last_low", "prev_last_low", "staged"):
        for be, max_t, ut, buf, piv, sw in itertools.product(
            be_triggers, max_trails, use_targets, buffers, pivots, swings
        ):
            out.append(
                {
                    "enabled": True,
                    "mode": mode,
                    "be_trigger_usd": float(be),
                    "be_offset_usd": 0.0,
                    "trail_buffer_usd": float(buf),
                    "max_trail_usd": float(max_t),
                    "use_target": ut,
                    "pivot_bars": int(piv),
                    "swing_interval": sw,
                    "label": mode,
                }
            )
    return out


def main() -> None:
    base = load_config(ROOT / "config.btc.london-mid-engulf.toml")
    bt = base.section("backtest")
    start = date.fromisoformat(str(bt["start"]))
    end = date.fromisoformat(str(bt["end"]))
    stop = float(base.raw["strategy"]["london_mid_engulf"]["stop_usdt"])
    rr = float(base.raw["strategy"]["london_mid_engulf"]["reward_risk"])

    print("Collecting entry signals...", flush=True)
    exec_candles, signals = _collect_signals(base, start, end)
    pad = start - timedelta(days=2)
    swing_15m = load_klines(base.symbol, "15m", pad, end, base.cache_dir, require_data=False)
    print(f"Signals={len(signals)} configs pending...", flush=True)

    configs = iter_configs()
    rows: list[dict] = []
    total = len(configs)
    for n, trail in enumerate(configs, 1):
        label = trail.pop("label", "?")
        row = _simulate(exec_candles, swing_15m, signals, base, trail, stop, rr)
        row["trail_config"] = {**trail, "label": label}
        row["label"] = label
        rows.append(row)
        if n % 50 == 0 or n == total:
            print(f"[{n}/{total}] latest net={row['net_pnl']} {label}", flush=True)

    best = max(rows, key=lambda r: r["net_pnl"])
    profitable = [r for r in rows if r["net_pnl"] > 0]
    by_mode: dict[str, dict] = {}
    for r in rows:
        m = r["label"]
        if m not in by_mode or r["net_pnl"] > by_mode[m]["net_pnl"]:
            by_mode[m] = r

    out = {
        "start": str(start),
        "end": str(end),
        "stop_usdt": stop,
        "reward_risk": rr,
        "config_count": total,
        "profitable_count": len(profitable),
        "best_by_net_pnl": best,
        "best_per_mode": by_mode,
        "top25": sorted(rows, key=lambda r: r["net_pnl"], reverse=True)[:25],
        "rows": rows,
    }
    path = ROOT / "out/reports/london-mid-engulf-trailing-full.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"\nDone. Profitable: {len(profitable)}/{total}")
    print("Best:", json.dumps(best, indent=2))
    print("Best per mode:", json.dumps({k: v["net_pnl"] for k, v in by_mode.items()}, indent=2))
    print("Wrote", path)


if __name__ == "__main__":
    main()
