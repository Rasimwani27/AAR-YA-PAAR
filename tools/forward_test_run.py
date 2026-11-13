#!/usr/bin/env python3
"""Forward test: live klines + strategy signals (Binance futures testnet or Bybit demo)."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import aar.strategies  # noqa: F401
from aar.config import load_config
from aar.core.models import Candle, Signal
from aar.core.rules import create_strategy
from aar.core.sessions import in_london, in_new_york, ms_to_ist_date
from aar.live.binance_testnet import klines as binance_klines
from aar.live.binance_testnet import mark_price as binance_mark_price
from aar.live.binance_testnet import position_risk as binance_position_risk
from aar.live.binance_testnet import probe_connection as binance_probe_connection

try:
    from aar.live.bybit_demo import format_qty
    from aar.live.bybit_demo import klines as bybit_klines
    from aar.live.bybit_demo import market_close_verified as bybit_market_close
    from aar.live.bybit_demo import market_open as bybit_market_open
    from aar.live.bybit_demo import mark_price as bybit_mark_price
    from aar.live.bybit_demo import position_risk as bybit_position_risk
    from aar.live.bybit_demo import probe_connection as bybit_probe_connection
    from aar.live.bybit_demo import wallet_equity_usd as bybit_wallet_equity_usd
except ImportError:
    bybit_klines = None  # type: ignore[misc, assignment]
    format_qty = None  # type: ignore[misc, assignment]


def _exchange_from_args(exchange: str) -> str:
    ex = (exchange or "bybit").strip().lower()
    if ex in ("binance", "binance_testnet", "b"):
        return "binance"
    if ex in ("bybit", "bybit_demo", "hyro"):
        return "bybit"
    raise ValueError(f"Unknown --exchange {exchange!r} (use binance or bybit)")


def _resolve_creds(exchange: str, args: argparse.Namespace) -> tuple[str, str]:
    if exchange == "bybit":
        k = (args.api_key or os.environ.get("BYBIT_API_KEY", "")).strip()
        s = (args.api_secret or os.environ.get("BYBIT_API_SECRET", "")).strip()
        return k, s
    k = (args.api_key or os.environ.get("BINANCE_API_KEY", "")).strip()
    s = (args.api_secret or os.environ.get("BINANCE_API_SECRET", "")).strip()
    return k, s
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


def _load_history(exchange: str, symbol: str, interval: str, days: int = 5) -> list[Candle]:
    limit = min(1000, days * 24 * 60 // int(interval[:-1]))
    if exchange == "bybit":
        if bybit_klines is None:
            raise RuntimeError("Bybit demo module not available")
        raw = bybit_klines(symbol, interval, limit=limit)
    else:
        raw = binance_klines(symbol, interval, limit=limit, testnet=True)
    return [_candle_from_row(r) for r in raw]


def _default_leverage() -> int:
    try:
        return max(1, min(100, int(os.environ.get("AAR_BYBIT_LEVERAGE", "10"))))
    except ValueError:
        return 10


def _signal_qty_for_risk(
    api_key: str,
    api_secret: str,
    stop_dist: float,
    risk_pct: float,
) -> float:
    if stop_dist <= 0:
        return 0.001
    equity = bybit_wallet_equity_usd(api_key, api_secret)
    risk_usd = equity * (float(risk_pct) / 100.0)
    qty = risk_usd / stop_dist
    if format_qty is None:
        return max(0.001, round(qty, 3))
    return float(format_qty(qty))


def _risk_pct_from_config(cfg_path: Path) -> float:
    try:
        cfg = load_config(cfg_path)
        strat = create_strategy(cfg)
        return float(strat.risk_pct())
    except Exception:
        return 2.0


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


def _write_error_state(message: str) -> None:
    out_dir = ROOT / "out" / "forward"
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "ok": False,
        "error": message,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    (out_dir / "state.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps({"ok": False, "error": message}), flush=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--configs", required=True, help="comma name:path,name:path")
    ap.add_argument(
        "--exchange",
        default=os.environ.get("AAR_FORWARD_EXCHANGE", "bybit"),
        help="bybit (demo api-demo.bybit.com, Hyro path) or binance (futures testnet)",
    )
    ap.add_argument("--api-key", default="")
    ap.add_argument("--api-secret", default="")
    ap.add_argument("--probe-only", action="store_true")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--skip-probe", action="store_true", help="Skip probe (dashboard already verified keys via Node)")
    ap.add_argument("--poll-seconds", type=int, default=60)
    args = ap.parse_args()

    try:
        exchange = _exchange_from_args(args.exchange)
    except ValueError as e:
        _write_error_state(str(e))
        return 1

    api_key, api_secret = _resolve_creds(exchange, args)
    if not api_key or not api_secret:
        hint = (
            "Use BYBIT_API_KEY and BYBIT_API_SECRET for --exchange bybit, "
            "or BINANCE_API_KEY / BINANCE_API_SECRET for Binance testnet."
        )
        _write_error_state(f"Missing API credentials. {hint}")
        return 1

    probe: dict
    if args.skip_probe:
        probe = {
            "ok": True,
            "exchange": exchange,
            "testnet": exchange == "binance",
            "skipped_probe": True,
        }
    else:
        try:
            if exchange == "bybit":
                probe = bybit_probe_connection(api_key, api_secret)
            else:
                probe = binance_probe_connection(api_key, api_secret, testnet=True)
        except Exception as e:
            _write_error_state(str(e))
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
        sym = "BTCUSDT"
        if exchange == "bybit" and (not api_key or not api_secret):
            raise RuntimeError("Bybit Demo Trading API key and secret required (no paper fallback).")
        bybit_trade = exchange == "bybit" and bool(api_key)
        leverage = _default_leverage()
        bybit_errors: list[str] = []

        def _close_bybit_if_live(pos) -> None:
            if not bybit_trade or not getattr(pos, "bybit_live", False):
                return
            try:
                bybit_market_close(
                    api_key,
                    api_secret,
                    symbol=sym,
                    side=pos.side,
                    qty=pos.qty,
                )
            except Exception as exc:
                bybit_errors.append(f"close {pos.strategy_id}: {exc}")

        candles = _load_history(exchange, sym, "3m", days=5)
        if not candles:
            raise RuntimeError(
                "No klines (Binance testnet: check testnet.binancefuture.com; "
                "Bybit demo: check api-demo.bybit.com and API key source)."
            )
        mark = float(candles[-1].close)
        try:
            if exchange == "bybit":
                mark = bybit_mark_price(sym)
            else:
                mark = binance_mark_price(sym, testnet=True)
        except Exception:
            pass

        ledger = ForwardLedger.load(ledger_path)
        closed_on_tick = ledger.update_mark(mark, now_iso, before_close=_close_bybit_if_live)

        results = []
        for label, cfg_path in pairs:
            if not cfg_path.exists():
                results.append({"label": label, "error": f"missing {cfg_path}"})
                continue
            try:
                row = {"label": label, **_run_strategy_tick(cfg_path, candles)}
            except Exception as exc:
                row = {"label": label, "error": str(exc)}
            results.append(row)
            sig = row.get("signal")
            if isinstance(sig, dict) and sig.get("side") in ("long", "short"):
                stop_dist = float(sig["stop_dist"])
                target_dist = float(sig["target_dist"])
                entry_price = float(sig["entry_price"])
                risk_pct = _risk_pct_from_config(cfg_path) if cfg_path.exists() else 2.0
                if not bybit_trade:
                    row["error"] = "Bybit demo credentials required for signal execution"
                    results[-1] = row
                    continue
                qty = _signal_qty_for_risk(api_key, api_secret, stop_dist, risk_pct)
                equity = bybit_wallet_equity_usd(api_key, api_secret)
                bybit_live = False
                bybit_order_id = ""
                stop_price = (
                    entry_price - stop_dist if sig["side"] == "long" else entry_price + stop_dist
                )
                target_price = (
                    entry_price + target_dist
                    if sig["side"] == "long"
                    else entry_price - target_dist
                )
                if bybit_trade:
                    try:
                        order = bybit_market_open(
                            api_key,
                            api_secret,
                            symbol=sym,
                            side=sig["side"],
                            qty=qty,
                            stop_price=stop_price,
                            target_price=target_price,
                            leverage=leverage,
                        )
                        bybit_live = True
                        bybit_order_id = str(order.get("order_id") or "")
                        ap = order.get("avg_price")
                        if ap:
                            entry_price = float(ap)
                        row["bybit_order"] = order
                    except Exception as exc:
                        bybit_errors.append(f"open {label}: {exc}")
                        row["bybit_error"] = str(exc)
                        results[-1] = row
                        continue

                if not bybit_live:
                    continue

                opened = ledger.open_from_signal(
                    strategy_id=label,
                    strategy_name=str(row.get("strategy") or label),
                    side=sig["side"],
                    entry_price=entry_price,
                    stop_dist=stop_dist,
                    target_dist=target_dist,
                    reason=str(sig.get("reason") or ""),
                    now_iso=now_iso,
                    signal_bar_ms=int(candles[-1].close_time_ms) if candles else None,
                    qty=qty,
                    leverage=float(leverage),
                    risk_pct=risk_pct,
                    account_equity_usd=equity,
                    bybit_live=bybit_live,
                    bybit_order_id=bybit_order_id,
                )
                if opened:
                    row["position_opened"] = opened.id

        ledger.save(ledger_path)

        exchange_positions: list[dict] = []
        try:
            if exchange == "bybit":
                exchange_positions = bybit_position_risk(api_key, api_secret)
            else:
                exchange_positions = binance_position_risk(api_key, api_secret, testnet=True)
        except Exception as exc:
            exchange_positions = [{"error": str(exc)}]

        stats = compute_stats(ledger, mark)
        exchange_unrealized = 0.0
        for ep in exchange_positions:
            if isinstance(ep, dict) and ep.get("error") is None:
                try:
                    exchange_unrealized += float(ep.get("unrealized_pnl") or 0)
                except (TypeError, ValueError):
                    pass
        payload = {
            "ok": True,
            "updated_at": now_iso,
            "exchange": exchange,
            "mark_price": mark,
            "probe": probe,
            "results": results,
            "positions": [],
            "closed_this_tick": [t.to_public() for t in closed_on_tick],
            "history": [t.to_public() for t in ledger.history[:100]],
            "stats": stats,
            "exchange_positions": exchange_positions,
            "exchange_stats": {
                "unrealized_usd": round(exchange_unrealized, 2),
                "position_count": sum(
                    1
                    for ep in exchange_positions
                    if isinstance(ep, dict) and ep.get("error") is None and float(ep.get("qty") or 0) > 0
                ),
            },
            "bybit_auto_trade": bybit_trade,
            "bybit_errors": bybit_errors[-20:],
        }
        state_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return payload

    if args.once:
        try:
            print(json.dumps(tick()), flush=True)
            return 0
        except Exception as e:
            _write_error_state(str(e))
            return 1

    from aar.live.binance_testnet import _is_transient_network_error

    skip_streak = 0
    while True:
        try:
            payload = tick()
            skip_streak = 0
        except Exception as e:
            if _is_transient_network_error(e):
                skip_streak += 1
                msg = str(e)
                print(
                    json.dumps(
                        {
                            "heartbeat_skip": msg,
                            "skip_streak": skip_streak,
                            "hint": "DNS/internet blip — retrying; check PC network if this repeats",
                        }
                    ),
                    flush=True,
                )
                time.sleep(min(120, max(30, args.poll_seconds)))
                continue
            _write_error_state(str(e))
            return 1
        print(json.dumps({"heartbeat": payload["updated_at"], "results": len(payload["results"])}), flush=True)
        time.sleep(max(10, args.poll_seconds))


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        _write_error_state(str(e))
        print(json.dumps({"ok": False, "error": str(e)}), flush=True)
        raise SystemExit(1) from e
