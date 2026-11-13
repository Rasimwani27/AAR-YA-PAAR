#!/usr/bin/env python3
"""Export forward-test or backtest trades for TradingView (Pine + CSV). Run from repo root in Cursor terminal."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

DEFAULT_SYMBOL = "BYBIT:BTCUSDT.P"


def _parse_iso_ms(iso: str) -> int:
    return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)


def _load_trades(state_path: Path, ledger_path: Path) -> tuple[list[dict], list[dict]]:
    history: list[dict] = []
    positions: list[dict] = []
    if state_path.exists():
        raw = json.loads(state_path.read_text(encoding="utf-8"))
        history = raw.get("history") or []
        positions = raw.get("positions") or []
    elif ledger_path.exists():
        raw = json.loads(ledger_path.read_text(encoding="utf-8"))
        history = raw.get("history") or []
        positions = raw.get("positions") or []
    return history, positions


def _stop_target_usd_from_config(cfg_path: Path) -> tuple[float | None, float | None]:
    """Approximate stop/target distance in USD for chart lines (matches fixed-USD strategies)."""
    from aar.config import load_config

    cfg = load_config(cfg_path)
    raw = cfg.raw.get("strategy", {})
    name = cfg.strategy_name
    if name == "fade-reversal":
        block = raw.get("fade_reversal") or {}
        stop = float(block.get("stop_usdt", 0) or 0)
        target = float(block.get("target_usdt", 0) or 0)
        return (stop or None, target or None)
    if name == "london-mid-engulf":
        block = raw.get("london_mid_engulf") or {}
        stop = float(block.get("stop_usdt", 0) or 0)
        rr = float(block.get("reward_risk", 0) or 0)
        if stop and rr:
            return stop, stop * rr
        return (stop or None, None)
    return None, None


def _markers_from_backtest_report(
    report: dict[str, Any], *, max_trades: int, stop_usd: float | None, target_usd: float | None
) -> list[dict]:
    trades = report.get("trades_detail") or []
    out: list[dict] = []
    for t in trades[:max_trades]:
        side = t["side"]
        entry = float(t["entry_price"])
        stop_px: float | None = None
        target_px: float | None = None
        if stop_usd:
            stop_px = entry - stop_usd if side == "long" else entry + stop_usd
        if target_usd:
            target_px = entry + target_usd if side == "long" else entry - target_usd
        out.append(
            {
                "entry_ms": int(t["entry_time_ms"]),
                "exit_ms": int(t["exit_time_ms"]),
                "entry_price": entry,
                "exit_price": float(t["exit_price"]),
                "side": side,
                "strategy_id": report.get("strategy") or "backtest",
                "exit_reason": t.get("exit_reason") or "",
                "open": False,
                "stop_price": stop_px,
                "target_price": target_px,
            }
        )
    return out


def _markers(history: list[dict], positions: list[dict], max_trades: int) -> list[dict]:
    out: list[dict] = []
    for p in positions:
        out.append(
            {
                "entry_ms": _parse_iso_ms(p["opened_at"]),
                "exit_ms": int(datetime.now(timezone.utc).timestamp() * 1000),
                "entry_price": p["entry_price"],
                "exit_price": p.get("mark_price", p["entry_price"]),
                "side": p["side"],
                "strategy_id": p["strategy_id"],
                "exit_reason": "open",
                "open": True,
                "stop_price": None,
                "target_price": None,
            }
        )
    for t in history[:max_trades]:
        out.append(
            {
                "entry_ms": _parse_iso_ms(t["opened_at"]),
                "exit_ms": _parse_iso_ms(t["closed_at"]),
                "entry_price": t["entry_price"],
                "exit_price": t["exit_price"],
                "side": t["side"],
                "strategy_id": t["strategy_id"],
                "exit_reason": t["exit_reason"],
                "open": False,
                "stop_price": None,
                "target_price": None,
            }
        )
    return out


def _pine_num(n: float) -> str:
    s = f"{n:.8f}".rstrip("0").rstrip(".")
    return s or "0"


def _pine_optional_float(v: float | None) -> str:
    return _pine_num(v) if v is not None else "na"


def build_pine(
    markers: list[dict],
    *,
    symbol: str,
    interval_min: int,
    title: str = "AAR trades",
) -> str:
    if not markers:
        return "// No trades — run forward test or export a backtest report first.\n"
    bar_ms = interval_min * 60_000
    entries = ", ".join(str(m["entry_ms"]) for m in markers)
    exits = ", ".join(str(m["exit_ms"]) for m in markers)
    entry_px = ", ".join(_pine_num(m["entry_price"]) for m in markers)
    exit_px = ", ".join(_pine_num(m["exit_price"]) for m in markers)
    stop_px = ", ".join(_pine_optional_float(m.get("stop_price")) for m in markers)
    target_px = ", ".join(_pine_optional_float(m.get("target_price")) for m in markers)
    is_long = ", ".join("true" if m["side"] == "long" else "false" for m in markers)
    tags = ", ".join(
        f'"{m["strategy_id"]}{" · OPEN" if m["open"] else " · " + m["exit_reason"]} · {m["side"]}"'
        for m in markers
    )
    return f"""//@version=5
indicator("{title}", overlay=true, max_labels_count=500, max_lines_count=500)
// Symbol: {symbol} · interval: {interval_min}m · tools/export_tradingview_trades.py

var int[] ENTRIES = array.from({entries})
var int[] EXITS = array.from({exits})
var float[] ENTRY_PX = array.from({entry_px})
var float[] EXIT_PX = array.from({exit_px})
var float[] STOP_PX = array.from({stop_px})
var float[] TARGET_PX = array.from({target_px})
var bool[] IS_LONG = array.from({is_long})
var string[] TAGS = array.from({tags})
int BAR_MS = {bar_ms}

bool near(int t) =>
    not na(t) and math.abs(time - t) <= BAR_MS

if barstate.isconfirmed
    for i = 0 to array.size(ENTRIES) - 1
        int et = array.get(ENTRIES, i)
        int xt = array.get(EXITS, i)
        if near(et)
            bool lng = array.get(IS_LONG, i)
            float ep = array.get(ENTRY_PX, i)
            float st = array.get(STOP_PX, i)
            float tg = array.get(TARGET_PX, i)
            label.new(bar_index, ep, "E " + array.get(TAGS, i),
                 style = lng ? label.style_label_up : label.style_label_down,
                 color = lng ? color.new(color.teal, 20) : color.new(color.orange, 20),
                 textcolor = color.white, size = size.small)
            line.new(et, ep, xt, ep, xloc=xloc.bar_time, color=color.new(color.teal, 50), width=1)
            if not na(st)
                line.new(et, st, xt, st, xloc=xloc.bar_time, color=color.new(color.red, 35), width=1, style=line.style_dashed)
            if not na(tg)
                line.new(et, tg, xt, tg, xloc=xloc.bar_time, color=color.new(color.green, 35), width=1, style=line.style_dashed)
        if near(xt) and xt != et
            float xp = array.get(EXIT_PX, i)
            label.new(bar_index, xp, "X " + array.get(TAGS, i),
                 style = label.style_label_down, color = color.new(color.gray, 30),
                 textcolor = color.white, size = size.tiny)
"""


def main() -> int:
    ap = argparse.ArgumentParser(description="Export forward or backtest trades for TradingView Pine overlay.")
    ap.add_argument("--state", type=Path, default=ROOT / "out/forward/state.json")
    ap.add_argument("--ledger", type=Path, default=ROOT / "out/forward/ledger.json")
    ap.add_argument(
        "--report",
        type=Path,
        help="Backtest JSON from out/reports (trades_detail). Use instead of forward state.",
    )
    ap.add_argument(
        "--backtest-config",
        type=Path,
        metavar="CONFIG.toml",
        help="Run backtest with this config, then export trades (writes report under reports_dir).",
    )
    ap.add_argument("--out-dir", type=Path, default=ROOT / "out/tradingview")
    ap.add_argument("--max-trades", type=int, default=80)
    ap.add_argument("--interval", type=int, default=3)
    ap.add_argument("--symbol", default=DEFAULT_SYMBOL)
    args = ap.parse_args()

    pine_title = "AAR forward trades"
    stop_usd: float | None = None
    target_usd: float | None = None

    if args.backtest_config:
        from datetime import date

        from aar.backtest.engine import run_backtest, save_report
        from aar.cli import _dates_from_config
        from aar.config import load_config

        cfg_path = args.backtest_config.resolve()
        cfg = load_config(cfg_path)
        start, end = _dates_from_config(cfg)
        result = run_backtest(cfg, start, end)
        report_path = cfg.reports_dir / f"{cfg.symbol.lower()}-{cfg.strategy_name}-tv-export.json"
        save_report(result, report_path)
        report = json.loads(report_path.read_text(encoding="utf-8"))
        stop_usd, target_usd = _stop_target_usd_from_config(cfg_path)
        markers = _markers_from_backtest_report(
            report, max_trades=args.max_trades, stop_usd=stop_usd, target_usd=target_usd
        )
        pine_title = "AAR backtest trades"
        print(f"Backtest report: {report_path} ({len(result.trades)} trades)")
    elif args.report:
        report = json.loads(args.report.read_text(encoding="utf-8"))
        cfg_hint = report.get("config")
        if cfg_hint:
            p = Path(cfg_hint)
            if p.is_file():
                stop_usd, target_usd = _stop_target_usd_from_config(p)
        markers = _markers_from_backtest_report(
            report, max_trades=args.max_trades, stop_usd=stop_usd, target_usd=target_usd
        )
        pine_title = "AAR backtest trades"
    else:
        history, positions = _load_trades(args.state, args.ledger)
        markers = _markers(history, positions, args.max_trades)

    args.out_dir.mkdir(parents=True, exist_ok=True)

    pine_path = args.out_dir / "aar-trades.pine"
    csv_path = args.out_dir / "aar-trades.csv"
    pine_path.write_text(
        build_pine(markers, symbol=args.symbol, interval_min=args.interval, title=pine_title),
        encoding="utf-8",
    )

    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            ["opened_at", "closed_at", "side", "strategy", "entry_price", "exit_price", "status", "exit_reason"]
        )
        for m in markers:
            w.writerow(
                [
                    datetime.fromtimestamp(m["entry_ms"] / 1000, tz=timezone.utc).isoformat(),
                    "" if m["open"] else datetime.fromtimestamp(m["exit_ms"] / 1000, tz=timezone.utc).isoformat(),
                    m["side"],
                    m["strategy_id"],
                    m["entry_price"],
                    m["exit_price"],
                    "open" if m["open"] else "closed",
                    m["exit_reason"],
                ]
            )

    print(f"Wrote {pine_path} ({len(markers)} markers)")
    print(f"Wrote {csv_path}")
    print(f"Open chart: https://www.tradingview.com/chart/?symbol={args.symbol.replace(':', '%3A')}&interval={args.interval}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
