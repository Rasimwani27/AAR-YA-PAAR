"""Bybit **demo trading** REST v5 (https://api-demo.bybit.com) — stdlib only.

Use API keys created in Bybit → Demo Trading (not testnet). Hyro Bybit challenges use this stack.
Public klines/mark data do not require keys; account/positions require HMAC-signed requests.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

# Signed requests: demo trading keys must call **api-demo.bybit.com**
DEMO_BASE = "https://api-demo.bybit.com"
# Public market data: use mainnet (same prices as Hyro/Bybit; demo domain may block some regions)
PUBLIC_BASE = "https://api.bybit.com"

_RECV_WINDOW = "50000"


def _sign_v5(timestamp: str, api_key: str, recv_window: str, payload: str, secret: str) -> str:
    raw = f"{timestamp}{api_key}{recv_window}{payload}"
    return hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()


def _sorted_qs(params: dict[str, str]) -> str:
    return urllib.parse.urlencode(sorted(params.items()))


def _public_headers() -> dict[str, str]:
    return {
        "User-Agent": "Mozilla/5.0 (compatible; AAR-forward-test/1.0)",
        "Accept": "application/json",
    }


def _urlopen(req: urllib.request.Request, timeout: float = 30.0) -> bytes:
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _is_transient_network_error(exc: BaseException) -> bool:
    if isinstance(exc, urllib.error.URLError):
        return True
    if isinstance(exc, TimeoutError):
        return True
    if isinstance(exc, OSError) and exc.errno in (11001, 11002, 10054, 10060, 10061):
        return True
    msg = str(exc).lower()
    return "getaddrinfo" in msg or "timed out" in msg or "temporary failure" in msg


def _request_public(method: str, path: str, params: dict[str, str] | None = None) -> Any:
    qs = _sorted_qs(params or {})
    base = PUBLIC_BASE
    url = f"{base}{path}?{qs}" if qs else f"{base}{path}"
    req = urllib.request.Request(url, method=method, headers=_public_headers())
    raw = _urlopen(req)
    body = raw.decode()
    data = json.loads(body) if body else {}
    if isinstance(data, dict) and data.get("retCode") not in (0, "0", None):
        if str(data.get("retCode")) == "0":
            return data
        raise RuntimeError(f"Bybit {path}: {data}")
    return data


def _parse_bybit_response(path: str, raw: bytes) -> Any:
    data = json.loads(raw.decode())
    if isinstance(data, dict):
        rc = data.get("retCode")
        if rc not in (0, "0") and rc is not None:
            raise RuntimeError(f"Bybit {path}: {data}")
    return data


def _request_signed(
    method: str,
    path: str,
    api_key: str,
    api_secret: str,
    params: dict[str, str] | None = None,
    *,
    json_body: dict[str, Any] | None = None,
) -> Any:
    ts = str(int(time.time() * 1000))
    method_u = method.upper()
    headers = {
        "User-Agent": "aar-forward-test/1.0",
        "Accept": "application/json",
        "X-BAPI-API-KEY": api_key,
        "X-BAPI-SIGN-TYPE": "2",
        "X-BAPI-TIMESTAMP": ts,
        "X-BAPI-RECV-WINDOW": _RECV_WINDOW,
    }
    if method_u == "GET":
        qs = _sorted_qs(params or {})
        payload_for_sign = qs
        sign = _sign_v5(ts, api_key, _RECV_WINDOW, payload_for_sign, api_secret)
        headers["X-BAPI-SIGN"] = sign
        url = f"{DEMO_BASE}{path}?{qs}" if qs else f"{DEMO_BASE}{path}"
        req = urllib.request.Request(url, method=method_u, headers=headers)
    else:
        body = json.dumps(json_body or {})
        sign = _sign_v5(ts, api_key, _RECV_WINDOW, body, api_secret)
        headers["X-BAPI-SIGN"] = sign
        headers["Content-Type"] = "application/json"
        url = f"{DEMO_BASE}{path}"
        req = urllib.request.Request(url, data=body.encode(), method=method_u, headers=headers)
    try:
        raw = _urlopen(req)
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        raise RuntimeError(f"Bybit HTTP {e.code}: {err}") from e
    return _parse_bybit_response(path, raw)


def format_qty(qty: float) -> str:
    steps = int(float(qty) * 1000) / 1000.0
    if steps < 0.001:
        raise ValueError("Qty too small for BTCUSDT (min 0.001)")
    return f"{steps:.3f}"


def wallet_equity_usd(api_key: str, api_secret: str) -> float:
    probe = probe_connection(api_key, api_secret)
    for key in ("availableBalance", "totalWalletBalance"):
        raw = probe.get(key)
        if raw is not None:
            try:
                v = float(raw)
                if v > 0:
                    return v
            except (TypeError, ValueError):
                pass
    return 1000.0


def set_leverage(api_key: str, api_secret: str, symbol: str, leverage: int) -> None:
    lev = str(min(100, max(1, int(leverage))))
    try:
        _request_signed(
            "POST",
            "/v5/position/set-leverage",
            api_key,
            api_secret,
            json_body={
                "category": "linear",
                "symbol": symbol,
                "buyLeverage": lev,
                "sellLeverage": lev,
            },
        )
    except RuntimeError as e:
        msg = str(e)
        if "110043" in msg or "same" in msg.lower() or "not modified" in msg.lower():
            return
        raise


def market_open(
    api_key: str,
    api_secret: str,
    *,
    symbol: str,
    side: str,
    qty: float,
    stop_price: float,
    target_price: float,
    leverage: int = 10,
) -> dict[str, Any]:
    set_leverage(api_key, api_secret, symbol, leverage)
    order_side = "Buy" if side == "long" else "Sell"
    data = _request_signed(
        "POST",
        "/v5/order/create",
        api_key,
        api_secret,
        json_body={
            "category": "linear",
            "symbol": symbol,
            "side": order_side,
            "orderType": "Market",
            "qty": format_qty(qty),
            "positionIdx": 0,
            "stopLoss": str(round(stop_price, 2)),
            "takeProfit": str(round(target_price, 2)),
            "tpTriggerBy": "MarkPrice",
            "slTriggerBy": "MarkPrice",
            "tpslMode": "Full",
        },
    )
    result = data.get("result") if isinstance(data, dict) else None
    order_id = ""
    avg_price: float | None = None
    if isinstance(result, dict):
        order_id = str(result.get("orderId") or "")
        ap = result.get("avgPrice")
        if ap is not None and str(ap) not in ("", "0"):
            try:
                avg_price = float(ap)
            except (TypeError, ValueError):
                avg_price = None
    return {"order_id": order_id, "avg_price": avg_price}


def _find_position(api_key: str, api_secret: str, symbol: str, side: str | None = None) -> dict[str, Any] | None:
    for row in position_risk(api_key, api_secret):
        if str(row.get("symbol", "")).upper() != symbol.upper():
            continue
        if side and row.get("side") != side:
            continue
        return row
    return None


def market_close(
    api_key: str,
    api_secret: str,
    *,
    symbol: str,
    side: str,
    qty: float,
) -> None:
    market_close_verified(api_key, api_secret, symbol=symbol, side=side, qty=qty)


def market_close_verified(
    api_key: str,
    api_secret: str,
    *,
    symbol: str,
    side: str,
    qty: float,
) -> dict[str, Any]:
    live = _find_position(api_key, api_secret, symbol, side)
    if not live:
        raise RuntimeError(f"No open {side} position on Bybit for {symbol}")
    live_qty = float(live.get("qty") or 0)
    close_qty = min(float(qty), live_qty)
    close_side = "Sell" if side == "long" else "Buy"
    data = _request_signed(
        "POST",
        "/v5/order/create",
        api_key,
        api_secret,
        json_body={
            "category": "linear",
            "symbol": symbol,
            "side": close_side,
            "orderType": "Market",
            "qty": format_qty(close_qty),
            "positionIdx": 0,
            "reduceOnly": True,
        },
    )
    order_id = ""
    result = data.get("result") if isinstance(data, dict) else None
    if isinstance(result, dict):
        order_id = str(result.get("orderId") or "")
    import time as _time

    remaining = live_qty
    for _ in range(15):
        _time.sleep(0.4)
        after = _find_position(api_key, api_secret, symbol, side)
        remaining = float(after.get("qty") or 0) if after else 0.0
        if live_qty - remaining + 1e-9 >= close_qty or remaining < 1e-12:
            return {
                "order_id": order_id,
                "closed_qty": min(close_qty, live_qty - remaining),
                "remaining_qty": remaining,
            }
    if abs(live_qty - remaining) < 1e-9:
        raise RuntimeError("Bybit did not confirm position close")
    return {
        "order_id": order_id,
        "closed_qty": live_qty - remaining,
        "remaining_qty": remaining,
    }


def klines(symbol: str, interval: str, *, limit: int = 500) -> list[list[Any]]:
    """Linear USDT perp klines. `interval` may be ``3m`` (Binance-style) or ``3``."""
    if interval.endswith("m") and interval[:-1].isdigit():
        iv = interval[:-1]
    else:
        iv = interval
    params = {
        "category": "linear",
        "symbol": symbol,
        "interval": iv,
        "limit": str(min(1000, max(1, limit))),
    }
    data = _request_public("GET", "/v5/market/kline", params)
    result = data.get("result") if isinstance(data, dict) else None
    if not isinstance(result, dict):
        return []
    lst = result.get("list")
    if not isinstance(lst, list):
        return []
    # Bybit returns newest first; Binance testnet returns oldest first — reverse for AAR
    out: list[list[Any]] = []
    for row in reversed(lst):
        if not isinstance(row, list) or len(row) < 6:
            continue
        # [start, open, high, low, close, volume, turnover] 
        start_ms = int(row[0])
        o, h, lo, c = float(row[1]), float(row[2]), float(row[3]), float(row[4])
        v = float(row[5]) if len(row) > 5 else 0.0
        end_ms = start_ms + int(iv) * 60_000 - 1
        out.append([start_ms, o, h, lo, c, v, end_ms])
    return out


def mark_price(symbol: str) -> float:
    params = {"category": "linear", "symbol": symbol}
    data = _request_public("GET", "/v5/market/tickers", params)
    result = data.get("result") if isinstance(data, dict) else None
    if not isinstance(result, dict):
        raise RuntimeError("Bybit tickers: bad response")
    lst = result.get("list")
    if not isinstance(lst, list) or not lst:
        raise RuntimeError(f"No ticker for {symbol}")
    row = lst[0]
    if isinstance(row, dict):
        mp = row.get("markPrice") or row.get("lastPrice")
        if mp is not None:
            return float(mp)
    raise RuntimeError(f"No mark price for {symbol}")


def position_risk(api_key: str, api_secret: str) -> list[dict[str, Any]]:
    """Open linear positions (USDT settle), Bybit-shaped rows."""
    params = {"category": "linear", "settleCoin": "USDT"}
    data = _request_signed("GET", "/v5/position/list", api_key, api_secret, params)
    result = data.get("result") if isinstance(data, dict) else None
    if not isinstance(result, dict):
        return []
    lst = result.get("list")
    if not isinstance(lst, list):
        return []
    open_pos: list[dict[str, Any]] = []
    for row in lst:
        if not isinstance(row, dict):
            continue
        try:
            sz = float(row.get("size") or 0)
        except (TypeError, ValueError):
            sz = 0.0
        if abs(sz) < 1e-12:
            continue
        side_raw = str(row.get("side") or "")
        side = "long" if side_raw == "Buy" else "short"
        open_pos.append(
            {
                "symbol": row.get("symbol"),
                "side": side,
                "qty": abs(sz),
                "entry_price": float(row.get("avgPrice") or 0),
                "mark_price": float(row.get("markPrice") or row.get("lastPrice") or 0),
                "unrealized_pnl": float(row.get("unrealisedPnl") or row.get("unrealizedPnl") or 0),
                "leverage": row.get("leverage"),
                "liquidation_price": row.get("liqPrice"),
            }
        )
    return open_pos


def probe_connection(api_key: str, api_secret: str) -> dict[str, Any]:
    """Wallet snapshot — confirms demo keys work."""
    params = {"accountType": "UNIFIED"}
    data = _request_signed("GET", "/v5/account/wallet-balance", api_key, api_secret, params)
    result = data.get("result") if isinstance(data, dict) else None
    coins = []
    if isinstance(result, dict):
        lst = result.get("list")
        if isinstance(lst, list) and lst:
            account = lst[0]
            if isinstance(account, dict):
                coins = account.get("coin") or []
    usdt = next((c for c in coins if isinstance(c, dict) and c.get("coin") == "USDT"), None)
    avail = usdt.get("availableToWithdraw") if isinstance(usdt, dict) else None
    if avail is None and isinstance(usdt, dict):
        avail = usdt.get("walletBalance")
    total = usdt.get("walletBalance") if isinstance(usdt, dict) else None
    return {
        "ok": True,
        "exchange": "bybit_demo",
        "testnet": False,
        "canTrade": True,
        "totalWalletBalance": str(total) if total is not None else None,
        "availableBalance": str(avail) if avail is not None else None,
        "updateTime": None,
    }
