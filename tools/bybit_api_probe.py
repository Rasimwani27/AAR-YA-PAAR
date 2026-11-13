#!/usr/bin/env python3
"""Test Bybit **demo trading** API keys (https://api-demo.bybit.com)."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from aar.live.bybit_demo import klines, probe_connection


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api-key", default=os.environ.get("BYBIT_API_KEY", ""))
    ap.add_argument("--api-secret", default=os.environ.get("BYBIT_API_SECRET", ""))
    args = ap.parse_args()
    if not args.api_key or not args.api_secret:
        print(json.dumps({"ok": False, "error": "Missing BYBIT_API_KEY or BYBIT_API_SECRET"}))
        return 1
    try:
        out = probe_connection(args.api_key, args.api_secret)
        k = klines("BTCUSDT", "3m", limit=3)
        out["klines_sample"] = len(k)
        print(json.dumps(out))
        return 0
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
