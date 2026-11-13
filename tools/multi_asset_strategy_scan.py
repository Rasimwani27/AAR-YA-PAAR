#!/usr/bin/env python3
"""Run both AAR strategies across symbol lists (Binance Vision 3m data only)."""

from __future__ import annotations

import argparse
import copy
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from aar.backtest.engine import run_backtest
from aar.config import AppConfig
from aar.data.vision import KlineFetchError

LONDON_CONFIG = ROOT / "config.btc.london-mid-engulf-winner.toml"
FADE_CONFIG = ROOT / "config.btc.fade-reversal-ny-trend.toml"

# Binance USDT-M futures — tick_size for level grid (approximate)
CRYPTO_TOP10: dict[str, float] = {
    "BTCUSDT": 0.10,
    "ETHUSDT": 0.01,
    "BNBUSDT": 0.01,
    "SOLUSDT": 0.01,
    "XRPUSDT": 0.0001,
    "DOGEUSDT": 0.00001,
    "ADAUSDT": 0.0001,
    "TRXUSDT": 0.00001,
    "AVAXUSDT": 0.001,
    "LINKUSDT": 0.001,
}

# Checked on data.binance.vision — no UM 3m monthly klines (404)
GOLD_SILVER_TV = {
    "XAUUSD (spot/CME via TradingView)": "not_on_binance_vision",
    "XAGUSD (spot/CME via TradingView)": "not_on_binance_vision",
    "PAXGUSDT": "spot_only_not_um_futures_3m",
}

INDIA_TV = {
    "NIFTY 50 index": "nse_data_not_in_aar",
    "BANK NIFTY": "nse_data_not_in_aar",
    "SENSEX": "bse_data_not_in_aar",
    "RELIANCE": "nse_data_not_in_aar",
    "TCS": "nse_data_not_in_aar",
    "HDFCBANK": "nse_data_not_in_aar",
    "INFY": "nse_data_not_in_aar",
    "ICICIBANK": "nse_data_not_in_aar",
    "BHARTIARTL": "nse_data_not_in_aar",
    "ITC": "nse_data_not_in_aar",
    "SBIN": "nse_data_not_in_aar",
    "LICI": "nse_data_not_in_aar",
}


def _load_overridden(path: Path, symbol: str, tick: float, start: date, end: date) -> AppConfig:
    import tomllib

    with path.open("rb") as f:
        raw = tomllib.load(f)
    raw = copy.deepcopy(raw)
    raw["market"]["symbol"] = symbol
    raw["market"]["tick_size"] = tick
    raw["backtest"]["start"] = start.isoformat()
    raw["backtest"]["end"] = end.isoformat()
    return AppConfig(raw=raw, path=path)


def _run_one(cfg: AppConfig, start: date, end: date) -> dict:
    try:
        res = run_backtest(cfg, start, end)
        return {
            "ok": True,
            "trades": len(res.trades),
            "net_pnl": round(res.net_pnl, 2),
            "return_pct": round(res.return_pct, 2),
            "win_rate": round(res.win_rate * 100, 1),
            "final_equity": round(res.final_equity, 2),
        }
    except KlineFetchError as e:
        return {"ok": False, "error": "no_data", "detail": str(e)}
    except Exception as e:
        return {"ok": False, "error": type(e).__name__, "detail": str(e)}


def main() -> int:
    ap = argparse.ArgumentParser(description="Scan london-mid + fade-reversal on multiple symbols.")
    ap.add_argument("--start", default="2024-08-01")
    ap.add_argument("--end", default="2025-08-01")
    ap.add_argument("--out", type=Path, default=ROOT / "out/reports/multi_asset_strategy_scan.json")
    args = ap.parse_args()
    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end)

    rows: list[dict] = []
    for symbol, tick in CRYPTO_TOP10.items():
        for label, cfg_path in (
            ("london-mid-engulf", LONDON_CONFIG),
            ("fade-reversal", FADE_CONFIG),
        ):
            cfg = _load_overridden(cfg_path, symbol, tick, start, end)
            stats = _run_one(cfg, start, end)
            rows.append(
                {
                    "universe": "crypto_top10_binance_um",
                    "symbol": symbol,
                    "strategy": label,
                    "period": f"{start}..{end}",
                    **stats,
                }
            )
            status = f"{stats.get('return_pct', stats.get('error'))}%"
            print(f"{symbol:12} {label:22} {status}", flush=True)

    report = {
        "note": "Strategies use BTC-tuned USD stops/sessions (London/NY IST). "
        "Indian NSE/BSE and gold/silver need a different data feed — listed as unsupported.",
        "period": {"start": str(start), "end": str(end)},
        "strategies": ["london-mid-engulf (winner config)", "fade-reversal (ny-trend config)"],
        "crypto_results": rows,
        "gold_silver": GOLD_SILVER_TV,
        "india_shares_and_indices": INDIA_TV,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nWrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
