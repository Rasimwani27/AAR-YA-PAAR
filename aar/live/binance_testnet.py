"""Binance USD-M futures testnet REST (stdlib only)."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

TESTNET_BASE = "https://testnet.binancefuture.com"
LIVE_BASE = "https://fapi.binance.com"


def _base_url(testnet: bool = True) -> str:
    if testnet:
        return TESTNET_BASE
    allow_live = os.environ.get("AAR_ALLOW_LIVE", "") == "1"
    if not allow_live:
        raise RuntimeError("Live Binance requires AAR_ALLOW_LIVE=1 and testnet=false")
    return LIVE_BASE


def _sign(query: str, secret: str) -> str:
    return hmac.new(secret.encode(), query.encode(), hashlib.sha256).hexdigest()


def _request(
    method: str,
    path: str,
    *,
    api_key: str | None = None,
    api_secret: str | None = None,
    params: dict[str, Any] | None = None,
    testnet: bool = True,
    timeout: float = 30.0,
) -> Any:
    base = _base_url(testnet)
    params = dict(params or {})
    headers = {"User-Agent": "aar-forward-test/1.0"}
    if api_key:
        headers["X-MBX-APIKEY"] = api_key
    if api_secret is not None:
        params["timestamp"] = int(time.time() * 1000)
        params.setdefault("recvWindow", 5000)
        q = urllib.parse.urlencode(params)
        params["signature"] = _sign(q, api_secret)
    q = urllib.parse.urlencode(params)
    url = f"{base}{path}?{q}" if q else f"{base}{path}"
    req = urllib.request.Request(url, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        try:
            payload = json.loads(err_body)
        except json.JSONDecodeError:
            payload = {"msg": err_body}
        raise RuntimeError(f"Binance HTTP {e.code}: {payload}") from e


def ping(*, testnet: bool = True) -> bool:
    _request("GET", "/fapi/v1/ping", testnet=testnet)
    return True


def account_info(api_key: str, api_secret: str, *, testnet: bool = True) -> dict[str, Any]:
    data = _request(
        "GET",
        "/fapi/v2/account",
        api_key=api_key,
        api_secret=api_secret,
        testnet=testnet,
    )
    return data if isinstance(data, dict) else {}


def klines(
    symbol: str,
    interval: str,
    *,
    limit: int = 500,
    testnet: bool = True,
) -> list[list[Any]]:
    data = _request(
        "GET",
        "/fapi/v1/klines",
        params={"symbol": symbol, "interval": interval, "limit": limit},
        testnet=testnet,
    )
    return data if isinstance(data, list) else []


def mark_price(symbol: str, *, testnet: bool = True) -> float:
    data = _request(
        "GET",
        "/fapi/v1/premiumIndex",
        params={"symbol": symbol},
        testnet=testnet,
    )
    if isinstance(data, dict) and data.get("markPrice"):
        return float(data["markPrice"])
    tick = _request("GET", "/fapi/v1/ticker/price", params={"symbol": symbol}, testnet=testnet)
    if isinstance(tick, dict) and tick.get("price"):
        return float(tick["price"])
    raise RuntimeError(f"No mark price for {symbol}")


def position_risk(api_key: str, api_secret: str, *, testnet: bool = True) -> list[dict[str, Any]]:
    data = _request(
        "GET",
        "/fapi/v2/positionRisk",
        api_key=api_key,
        api_secret=api_secret,
        testnet=testnet,
    )
    if not isinstance(data, list):
        return []
    open_pos = []
    for row in data:
        try:
            amt = float(row.get("positionAmt") or 0)
        except (TypeError, ValueError):
            amt = 0.0
        if abs(amt) < 1e-12:
            continue
        open_pos.append(
            {
                "symbol": row.get("symbol"),
                "side": "long" if amt > 0 else "short",
                "qty": abs(amt),
                "entry_price": float(row.get("entryPrice") or 0),
                "mark_price": float(row.get("markPrice") or 0),
                "unrealized_pnl": float(row.get("unRealizedProfit") or 0),
                "leverage": row.get("leverage"),
                "liquidation_price": row.get("liquidationPrice"),
            }
        )
    return open_pos


def probe_connection(api_key: str, api_secret: str, *, testnet: bool = True) -> dict[str, Any]:
    ping(testnet=testnet)
    acct = account_info(api_key, api_secret, testnet=testnet)
    assets = acct.get("assets") or []
    usdt = next((a for a in assets if a.get("asset") == "USDT"), None)
    return {
        "ok": True,
        "testnet": testnet,
        "canTrade": acct.get("canTrade"),
        "totalWalletBalance": acct.get("totalWalletBalance"),
        "availableBalance": usdt.get("availableBalance") if usdt else None,
        "updateTime": acct.get("updateTime"),
    }
