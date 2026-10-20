#!/usr/bin/env python3
"""Test Binance futures testnet API keys; prints JSON."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from aar.live.binance_testnet import probe_connection


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api-key", default=os.environ.get("BINANCE_API_KEY", ""))
    ap.add_argument("--api-secret", default=os.environ.get("BINANCE_API_SECRET", ""))
    ap.add_argument("--live", action="store_true", help="Use mainnet (requires AAR_ALLOW_LIVE=1)")
    args = ap.parse_args()
    if not args.api_key or not args.api_secret:
        print(json.dumps({"ok": False, "error": "Missing API key or secret"}))
        return 1
    try:
        out = probe_connection(args.api_key, args.api_secret, testnet=not args.live)
        print(json.dumps(out))
        return 0
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
