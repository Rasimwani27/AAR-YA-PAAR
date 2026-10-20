from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

from aar.backtest.engine import run_backtest, save_report
from aar.config import load_config


def _dates_from_config(cfg) -> tuple[date, date]:
    bt = cfg.section("backtest")
    return date.fromisoformat(bt["start"]), date.fromisoformat(bt["end"])


def cmd_backtest(args: argparse.Namespace) -> int:
    cfg_path = Path(args.config)
    cfg = load_config(cfg_path)
    start, end = _dates_from_config(cfg)
    if args.start:
        start = date.fromisoformat(args.start)
    if args.end:
        end = date.fromisoformat(args.end)

    result = run_backtest(cfg, start, end)

    reports = cfg.reports_dir
    reports.mkdir(parents=True, exist_ok=True)
    out_name = args.output or f"{cfg.symbol.lower()}-{cfg.strategy_name}.json"
    out_path = reports / out_name
    save_report(result, out_path)

    print(json.dumps(result.summary(), indent=2))
    print(f"report: {out_path}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="aar")
    sub = parser.add_subparsers(dest="command", required=True)

    bt = sub.add_parser("backtest", help="Run candle replay backtest")
    bt.add_argument("--config", required=True, help="Path to config TOML")
    bt.add_argument("--start", help="Override backtest start YYYY-MM-DD")
    bt.add_argument("--end", help="Override backtest end YYYY-MM-DD")
    bt.add_argument("--output", help="Report filename under reports_dir")
    bt.set_defaults(func=cmd_backtest)

    args = parser.parse_args(argv)
    return args.func(args)
