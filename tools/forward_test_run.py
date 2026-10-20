#!/usr/bin/env python3
"""Forward test: live testnet klines + strategy signals (dry-run or testnet orders)."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import aar.strategies  # noqa: F401
from aar.config import load_config
from aar.core.models import Candle, Signal
from aar.core.rules import create_strategy
from aar.core.sessions import in_london, in_new_york, ms_to_ist_date
from aar.live.binance_testnet import klines, mark_price, position_risk, probe_connection
from aar.live.forward_tracker import ForwardLedger, compute_stats
from aar.strategies.break_fade import build_levels_for_day
from aar.strategies.fade_reversal import FadeReversalStrategy
from aar.strategies.london_mid_engulf import LondonMidEngulfStrategy


def _candle_from_row(row: list) -> Candle:
    return Candle(
        open_time_ms=int(row[0]),
        open=float(row[1]),
        high=float(row[2]),
        low=float(row[3]),
        close=float(row[4]),
        volume=float(row[5]),
        close_time_ms=int(row[6]),
    )


def _load_history(symbol: str, interval: str, days: int = 5) -> list[Candle]:
    raw = klines(symbol, interval, limit=min(1500, days * 24 * 60 // int(interval[:-1])), testnet=True)
    return [_candle_from_row(r) for r in raw]


def _run_strategy_tick(cfg_path: Path, candles: list[Candle]) -> dict:
    cfg = load_config(cfg_path)
    strategy = create_strategy(cfg)
    name = cfg.strategy_name
    if len(candles) < 50:
        return {"strategy": name, "error": "not enough candles"}

    # Replay last ~2 days to rebuild state, signal only on last bar
    tail = candles[-800:]
    pad_start = ms_to_ist_date(tail[0].open_time_ms)
    level_iv = cfg.level_interval
    anchor_iv = cfg.anchor_interval

    from aar.data.vision import load_klines

    end = date.today()
    start = end - timedelta(days=5)
    level_c = load_klines(cfg.symbol, level_iv, start, end, cfg.cache_dir, require_data=False)
    anchor_c = load_klines(cfg.symbol, anchor_iv, start, end, cfg.cache_dir, require_data=False)
    if not level_c:
        level_c = tail
    if not anchor_c:
        anchor_c = tail

    signal: Signal | None = None
    last_reason = ""
    current_day = None
    for i, c in enumerate(tail):
        day = ms_to_ist_date(c.open_time_ms)
        if day != current_day:
            current_day = day
            levels = build_levels_for_day(cfg, day, level_c, anchor_c)
            strategy.on_day_levels(levels)
            if isinstance(strategy, FadeReversalStrategy):
                strategy._bf._current_day = day
                strategy._bf._trades_today = 0

        if isinstance(strategy, FadeReversalStrategy):
            tw = in_new_york(c.open_time_ms)
            sig = strategy.on_candle(c, in_trading_window=tw)
        elif isinstance(strategy, LondonMidEngulfStrategy):
            sig = strategy.on_candle(c, in_trading_window=True)
        else:
            sig = None
        if i == len(tail) - 1 and isinstance(sig, Signal):
            signal = sig
            last_reason = sig.reason

    if signal is None:
        return {"strategy": name, "signal": None, "last_bar": tail[-1].close}
    return {
        "strategy": name,
        "signal": {
            "side": signal.side,
            "entry_price": signal.entry_price,
            "stop_dist": signal.stop_dist,
            "target_dist": signal.target_dist,
            "reason": last_reason,
        },
        "dry_run": True,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--configs", required=True, help="comma name:path,name:path")
    ap.add_argument("--api-key", default=os.environ.get("BINANCE_API_KEY", ""))
    ap.add_argument("--api-secret", default=os.environ.get("BINANCE_API_SECRET", ""))
    ap.add_argument("--probe-only", action="store_true")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--poll-seconds", type=int, default=60)
    args = ap.parse_args()

    if not args.api_key or not args.api_secret:
        print(json.dumps({"ok": False, "error": "Missing API credentials"}))
        return 1

    try:
        probe = probe_connection(args.api_key, args.api_secret, testnet=True)
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        return 1

    if args.probe_only:
        print(json.dumps({"ok": True, "probe": probe}))
        return 0

    pairs = []
    for part in args.configs.split(","):
        part = part.strip()
        if not part:
            continue
        if ":" in part:
            name, path = part.split(":", 1)
        else:
            name, path = part, part
        pairs.append((name.strip(), ROOT / path.strip()))

    out_dir = ROOT / "out" / "forward"
    out_dir.mkdir(parents=True, exist_ok=True)
    state_path = out_dir / "state.json"
    ledger_path = out_dir / "ledger.json"

    def tick() -> dict:
        now_iso = datetime.now(timezone.utc).isoformat()
        candles = _load_history("BTCUSDT", "3m", days=5)
        mark = float(candles[-1].close) if candles else 0.0
        try:
            mark = mark_price("BTCUSDT", testnet=True)
        except Exception:
            pass

        ledger = ForwardLedger.load(ledger_path)
        closed_on_tick = ledger.update_mark(mark, now_iso)

        results = []
        for label, cfg_path in pairs:
            if not cfg_path.exists():
                results.append({"label": label, "error": f"missing {cfg_path}"})
                continue
            row = {"label": label, **_run_strategy_tick(cfg_path, candles)}
            results.append(row)
            sig = row.get("signal")
            if isinstance(sig, dict) and sig.get("side") in ("long", "short"):
                opened = ledger.open_from_signal(
                    strategy_id=label,
                    strategy_name=str(row.get("strategy") or label),
                    side=sig["side"],
                    entry_price=float(sig["entry_price"]),
                    stop_dist=float(sig["stop_dist"]),
                    target_dist=float(sig["target_dist"]),
                    reason=str(sig.get("reason") or ""),
                    now_iso=now_iso,
                    signal_bar_ms=int(candles[-1].close_time_ms) if candles else None,
                )
                if opened:
                    row["position_opened"] = opened.id

        ledger.save(ledger_path)

        exchange_positions: list[dict] = []
        try:
            exchange_positions = position_risk(args.api_key, args.api_secret, testnet=True)
        except Exception as exc:
            exchange_positions = [{"error": str(exc)}]

        stats = compute_stats(ledger, mark)
        payload = {
            "ok": True,
            "updated_at": now_iso,
            "mark_price": mark,
            "probe": probe,
            "results": results,
            "positions": [p.to_public(mark) for p in ledger.positions],
            "closed_this_tick": [t.to_public() for t in closed_on_tick],
            "history": [t.to_public() for t in ledger.history[:100]],
            "stats": stats,
            "exchange_positions": exchange_positions,
        }
        state_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return payload

    if args.once:
        print(json.dumps(tick()))
        return 0

    while True:
        payload = tick()
        print(json.dumps({"heartbeat": payload["updated_at"], "results": len(payload["results"])}), flush=True)
        time.sleep(max(10, args.poll_seconds))


if __name__ == "__main__":
    raise SystemExit(main())
