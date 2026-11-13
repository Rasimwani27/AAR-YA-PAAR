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

_time_offset_ms = 0
_time_offset_at = 0.0
_TIME_OFFSET_TTL = 60.0


def _base_url(testnet: bool = True) -> str:
    if testnet:
        return TESTNET_BASE
    allow_live = os.environ.get("AAR_ALLOW_LIVE", "") == "1"
    if not allow_live:
        raise RuntimeError("Live Binance requires AAR_ALLOW_LIVE=1 and testnet=false")
    return LIVE_BASE


def _sign(query: str, secret: str) -> str:
    return hmac.new(secret.encode(), query.encode(), hashlib.sha256).hexdigest()


def _fetch_server_time_ms(*, testnet: bool = True) -> int:
    base = _base_url(testnet)
    url = f"{base}/fapi/v1/time"
    req = urllib.request.Request(url, headers={"User-Agent": "aar-forward-test/1.0"})
    data = json.loads(_urlopen_with_retry(req, 15.0).decode())
    if not isinstance(data, dict) or "serverTime" not in data:
        raise RuntimeError("Could not read Binance serverTime")
    return int(data["serverTime"])


def _sync_server_time(*, testnet: bool = True) -> None:
    global _time_offset_ms, _time_offset_at
    server_ms = _fetch_server_time_ms(testnet=testnet)
    local_ms = int(time.time() * 1000)
    _time_offset_ms = server_ms - local_ms
    _time_offset_at = time.time()


def _signed_timestamp_ms(*, testnet: bool = True) -> int:
    global _time_offset_at
    if time.time() - _time_offset_at > _TIME_OFFSET_TTL:
        _sync_server_time(testnet=testnet)
    return int(time.time() * 1000) + _time_offset_ms


def _is_timestamp_error(payload: Any) -> bool:
    return isinstance(payload, dict) and payload.get("code") in (-1021, -1022)


def _is_transient_network_error(exc: BaseException) -> bool:
    if isinstance(exc, urllib.error.URLError):
        return True
    if isinstance(exc, TimeoutError):
        return True
    if isinstance(exc, OSError):
        # Windows: 11001 getaddrinfo, 11002 host not found, 10054 reset, etc.
        if exc.errno in (11001, 11002, 10054, 10060, 10061):
            return True
    msg = str(exc).lower()
    return "getaddrinfo" in msg or "timed out" in msg or "temporary failure" in msg


def _urlopen_with_retry(req: urllib.request.Request, timeout: float, attempts: int = 5) -> bytes:
    last: BaseException | None = None
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError:
            raise
        except Exception as e:
            last = e
            if not _is_transient_network_error(e) or attempt >= attempts - 1:
                raise
            time.sleep(min(30.0, 2.0 * (attempt + 1)))
    raise last if last else RuntimeError("network request failed")


def _request(
    method: str,
    path: str,
    *,
    api_key: str | None = None,
    api_secret: str | None = None,
    params: dict[str, Any] | None = None,
    testnet: bool = True,
    timeout: float = 30.0,
    _retry_clock: bool = True,
) -> Any:
    base = _base_url(testnet)
    base_params = dict(params or {})
    params = dict(base_params)
    headers = {"User-Agent": "aar-forward-test/1.0"}
    if api_key:
        headers["X-MBX-APIKEY"] = api_key
    if api_secret is not None:
        params["timestamp"] = _signed_timestamp_ms(testnet=testnet)
        params.setdefault("recvWindow", 10000)
        q = urllib.parse.urlencode(params)
        params["signature"] = _sign(q, api_secret)
    q = urllib.parse.urlencode(params)
    url = f"{base}{path}?{q}" if q else f"{base}{path}"
    req = urllib.request.Request(url, method=method, headers=headers)
    try:
        raw = _urlopen_with_retry(req, timeout)
        body = raw.decode()
        return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        try:
            payload = json.loads(err_body)
        except json.JSONDecodeError:
            payload = {"msg": err_body}
        if _retry_clock and api_secret is not None and _is_timestamp_error(payload):
            _sync_server_time(testnet=testnet)
            return _request(
                method,
                path,
                api_key=api_key,
                api_secret=api_secret,
                params=base_params,
                testnet=testnet,
                timeout=timeout,
                _retry_clock=False,
            )
        if _is_timestamp_error(payload):
            raise RuntimeError(
                f"Binance HTTP {e.code}: {payload} — PC clock out of sync. "
                "Windows: Settings -> Time -> Set time automatically -> Sync now."
            ) from e
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
    _sync_server_time(testnet=testnet)
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
