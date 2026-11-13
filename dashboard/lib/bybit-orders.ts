/**
 * Bybit trading — REST v5 (demo or mainnet via `environment`).
 */

import { createHmac } from "node:crypto";

import {
  type BybitEnvironment,
  BYBIT_DEMO_PUBLIC_WS,
  BYBIT_DEMO_PRIVATE_WS,
  bybitRestBase,
} from "@/lib/bybit-environment";
import { formatBybitReachabilityError } from "@/lib/bybit-probe";

export const BYBIT_DEMO_BASE = "https://api-demo.bybit.com";
export const BYBIT_PUBLIC_WS = BYBIT_DEMO_PUBLIC_WS;
export const BYBIT_PRIVATE_WS = BYBIT_DEMO_PRIVATE_WS;
const RECV_WINDOW = "50000";

export type BybitOrderStatus =
  | "Pending"
  | "PartiallyFilled"
  | "Filled"
  | "Cancelled"
  | "Rejected"
  | "New"
  | "Untriggered";

export type BybitOpenOrder = {
  orderId: string;
  symbol: string;
  side: "Buy" | "Sell";
  orderType: string;
  price: number;
  qty: number;
  cumExecQty: number;
  leavesQty: number;
  status: BybitOrderStatus;
  createdTime: string;
  reduceOnly: boolean;
};

export type BybitPositionRow = {
  symbol: string;
  side: "long" | "short";
  qty: number;
  entry_price: number;
  mark_price: number;
  unrealized_pnl: number;
  leverage: string | number;
  liquidation_price?: number;
  position_value?: number;
  cum_realised_pnl?: number;
};

function signV5(timestamp: string, apiKey: string, recvWindow: string, payload: string, secret: string): string {
  const raw = `${timestamp}${apiKey}${recvWindow}${payload}`;
  return createHmac("sha256", secret).update(raw).digest("hex");
}

function sortedQs(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k] ?? "")}`)
    .join("&");
}

async function requestSignedGet(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  apiSecret: string,
  environment: BybitEnvironment = "demo",
): Promise<Record<string, unknown>> {
  const qs = sortedQs(params);
  const ts = String(Date.now());
  const sign = signV5(ts, apiKey, RECV_WINDOW, qs, apiSecret);
  const res = await fetch(`${bybitRestBase(environment)}${path}?${qs}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "aar-dashboard/1.0",
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-SIGN": sign,
      "X-BAPI-SIGN-TYPE": "2",
      "X-BAPI-TIMESTAMP": ts,
      "X-BAPI-RECV-WINDOW": RECV_WINDOW,
    },
  });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(formatBybitReachabilityError(res.status, text));
  }
  if (!res.ok) throw new Error(formatBybitReachabilityError(res.status, text));
  const rc = data.retCode;
  if (rc != null && rc !== 0 && rc !== "0") throw new Error(`Bybit ${path}: ${text}`);
  return data;
}

async function requestSignedPost(
  path: string,
  body: Record<string, unknown>,
  apiKey: string,
  apiSecret: string,
  environment: BybitEnvironment = "demo",
): Promise<Record<string, unknown>> {
  const jsonBody = JSON.stringify(body);
  const ts = String(Date.now());
  const sign = signV5(ts, apiKey, RECV_WINDOW, jsonBody, apiSecret);
  const res = await fetch(`${bybitRestBase(environment)}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "aar-dashboard/1.0",
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-SIGN": sign,
      "X-BAPI-SIGN-TYPE": "2",
      "X-BAPI-TIMESTAMP": ts,
      "X-BAPI-RECV-WINDOW": RECV_WINDOW,
    },
    body: jsonBody,
  });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(formatBybitReachabilityError(res.status, text));
  }
  if (!res.ok) {
    throw new Error(formatBybitReachabilityError(res.status, text));
  }
  const rc = data.retCode;
  if (rc != null && rc !== 0 && rc !== "0") {
    throw new Error(`Bybit ${path}: ${text}`);
  }
  return data;
}

function mapOrderStatus(raw: string): BybitOrderStatus {
  const s = raw.trim();
  if (s === "Filled") return "Filled";
  if (s === "PartiallyFilled") return "PartiallyFilled";
  if (s === "Cancelled") return "Cancelled";
  if (s === "Rejected") return "Rejected";
  if (s === "New") return "Pending";
  return "Pending";
}

function mapPositionRow(r: Record<string, unknown>): BybitPositionRow | null {
  const sz = parseFloat(String(r.size ?? 0));
  if (Math.abs(sz) < 1e-12) return null;
  return {
    symbol: String(r.symbol ?? ""),
    side: String(r.side) === "Buy" ? "long" : "short",
    qty: Math.abs(sz),
    entry_price: parseFloat(String(r.avgPrice ?? 0)),
    mark_price: parseFloat(String(r.markPrice ?? r.lastPrice ?? 0)),
    unrealized_pnl: parseFloat(String(r.unrealisedPnl ?? r.unrealizedPnl ?? 0)),
    leverage: r.leverage != null ? String(r.leverage) : "1",
    liquidation_price: parseFloat(String(r.liqPrice ?? 0)) || undefined,
    position_value: parseFloat(String(r.positionValue ?? 0)) || undefined,
    cum_realised_pnl: parseFloat(String(r.cumRealisedPnl ?? 0)) || undefined,
  };
}

export async function fetchBybitPositions(
  apiKey: string,
  apiSecret: string,
  environment: BybitEnvironment = "demo",
): Promise<BybitPositionRow[]> {
  const data = await requestSignedGet(
    "/v5/position/list",
    { category: "linear", settleCoin: "USDT" },
    apiKey,
    apiSecret,
    environment,
  );
  const list = (data.result as { list?: unknown[] } | undefined)?.list ?? [];
  const out: BybitPositionRow[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const mapped = mapPositionRow(row as Record<string, unknown>);
    if (mapped) out.push(mapped);
  }
  return out;
}

export async function findBybitPosition(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  side?: "long" | "short",
  environment: BybitEnvironment = "demo",
): Promise<BybitPositionRow | null> {
  const positions = await fetchBybitPositions(apiKey, apiSecret, environment);
  const sym = symbol.toUpperCase();
  for (const p of positions) {
    if (String(p.symbol).toUpperCase() !== sym) continue;
    if (side && p.side !== side) continue;
    return p;
  }
  return null;
}

export function formatBybitQty(qty: number): string {
  const steps = Math.floor(qty * 1000) / 1000;
  if (steps < 0.001) {
    throw new Error("Qty too small for BTCUSDT (min 0.001)");
  }
  return steps.toFixed(3);
}

export async function setBybitLeverage(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  leverage: number,
  environment: BybitEnvironment = "demo",
): Promise<void> {
  const lev = String(Math.min(100, Math.max(1, Math.round(leverage))));
  try {
    await requestSignedPost(
      "/v5/position/set-leverage",
      {
        category: "linear",
        symbol,
        buyLeverage: lev,
        sellLeverage: lev,
      },
      apiKey,
      apiSecret,
      environment,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/same|not modified|110043/i.test(msg)) return;
    throw e;
  }
}

export type BybitMarketOpenResult = {
  orderId: string;
  avgPrice: number | null;
  orderStatus: BybitOrderStatus;
};

export async function pollOrderStatus(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  orderId: string,
  maxAttempts = 12,
  delayMs = 500,
  environment: BybitEnvironment = "demo",
): Promise<{ status: BybitOrderStatus; avgPrice: number | null; cumExecQty: number }> {
  for (let i = 0; i < maxAttempts; i += 1) {
    const data = await requestSignedGet(
      "/v5/order/realtime",
      { category: "linear", symbol, orderId },
      apiKey,
      apiSecret,
      environment,
    );
    const list = (data.result as { list?: unknown[] } | undefined)?.list ?? [];
    const row = list[0] as Record<string, unknown> | undefined;
    if (row) {
      const status = mapOrderStatus(String(row.orderStatus ?? ""));
      const avgPrice = row.avgPrice != null ? parseFloat(String(row.avgPrice)) : null;
      const cumExecQty = parseFloat(String(row.cumExecQty ?? 0));
      if (status === "Filled" || status === "PartiallyFilled" || status === "Cancelled" || status === "Rejected") {
        return { status, avgPrice, cumExecQty };
      }
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return { status: "Pending", avgPrice: null, cumExecQty: 0 };
}

export async function bybitMarketOpen(
  apiKey: string,
  apiSecret: string,
  params: {
    symbol: string;
    side: "long" | "short";
    qty: number;
    stopPrice: number;
    targetPrice: number;
    leverage: number;
  },
  environment: BybitEnvironment = "demo",
): Promise<BybitMarketOpenResult> {
  await setBybitLeverage(apiKey, apiSecret, params.symbol, params.leverage, environment);
  const side = params.side === "long" ? "Buy" : "Sell";
  const data = await requestSignedPost(
    "/v5/order/create",
    {
      category: "linear",
      symbol: params.symbol,
      side,
      orderType: "Market",
      qty: formatBybitQty(params.qty),
      positionIdx: 0,
      stopLoss: String(params.stopPrice),
      takeProfit: String(params.targetPrice),
      tpTriggerBy: "MarkPrice",
      slTriggerBy: "MarkPrice",
      tpslMode: "Full",
    },
    apiKey,
    apiSecret,
    environment,
  );
  const result = data.result as Record<string, unknown> | undefined;
  const orderId = String(result?.orderId ?? "");
  const polled = orderId
    ? await pollOrderStatus(apiKey, apiSecret, params.symbol, orderId, 12, 500, environment)
    : null;
  return {
    orderId,
    avgPrice: polled?.avgPrice ?? (result?.avgPrice != null ? parseFloat(String(result.avgPrice)) : null),
    orderStatus: polled?.status ?? "Filled",
  };
}

export async function bybitLimitOpen(
  apiKey: string,
  apiSecret: string,
  params: {
    symbol: string;
    side: "long" | "short";
    qty: number;
    limitPrice: number;
    stopPrice?: number;
    targetPrice?: number;
    leverage: number;
    reduceOnly?: boolean;
  },
  environment: BybitEnvironment = "demo",
): Promise<BybitMarketOpenResult> {
  await setBybitLeverage(apiKey, apiSecret, params.symbol, params.leverage, environment);
  const side = params.side === "long" ? "Buy" : "Sell";
  const body: Record<string, unknown> = {
    category: "linear",
    symbol: params.symbol,
    side,
    orderType: "Limit",
    price: String(params.limitPrice),
    qty: formatBybitQty(params.qty),
    positionIdx: 0,
    timeInForce: "GTC",
    reduceOnly: Boolean(params.reduceOnly),
  };
  if (params.stopPrice != null && params.targetPrice != null) {
    body.stopLoss = String(params.stopPrice);
    body.takeProfit = String(params.targetPrice);
    body.tpTriggerBy = "MarkPrice";
    body.slTriggerBy = "MarkPrice";
    body.tpslMode = "Full";
  }
  const data = await requestSignedPost("/v5/order/create", body, apiKey, apiSecret, environment);
  const result = data.result as Record<string, unknown> | undefined;
  const orderId = String(result?.orderId ?? "");
  return { orderId, avgPrice: null, orderStatus: "Pending" };
}

export async function bybitCancelOrder(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  orderId: string,
  environment: BybitEnvironment = "demo",
): Promise<void> {
  await requestSignedPost(
    "/v5/order/cancel",
    { category: "linear", symbol, orderId },
    apiKey,
    apiSecret,
    environment,
  );
}

export async function fetchBybitOpenOrders(
  apiKey: string,
  apiSecret: string,
  symbol?: string,
  environment: BybitEnvironment = "demo",
): Promise<BybitOpenOrder[]> {
  const params: Record<string, string> = { category: "linear", settleCoin: "USDT" };
  if (symbol) params.symbol = symbol;
  const data = await requestSignedGet("/v5/order/realtime", params, apiKey, apiSecret, environment);
  const list = (data.result as { list?: unknown[] } | undefined)?.list ?? [];
  const out: BybitOpenOrder[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const status = mapOrderStatus(String(r.orderStatus ?? ""));
    if (status === "Filled" || status === "Cancelled") continue;
    out.push({
      orderId: String(r.orderId ?? ""),
      symbol: String(r.symbol ?? ""),
      side: String(r.side) === "Buy" ? "Buy" : "Sell",
      orderType: String(r.orderType ?? ""),
      price: parseFloat(String(r.price ?? 0)),
      qty: parseFloat(String(r.qty ?? 0)),
      cumExecQty: parseFloat(String(r.cumExecQty ?? 0)),
      leavesQty: parseFloat(String(r.leavesQty ?? r.qty ?? 0)),
      status,
      createdTime: String(r.createdTime ?? ""),
      reduceOnly: String(r.reduceOnly) === "true" || r.reduceOnly === true,
    });
  }
  return out;
}

export type BybitCloseResult = {
  orderId: string;
  closedQty: number;
  remainingQty: number;
};

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/** Market close with reduceOnly; verifies size on Bybit before returning. */
export async function bybitMarketCloseVerified(
  apiKey: string,
  apiSecret: string,
  params: { symbol: string; side: "long" | "short"; qty: number },
  environment: BybitEnvironment = "demo",
): Promise<BybitCloseResult> {
  const live = await findBybitPosition(apiKey, apiSecret, params.symbol, params.side, environment);
  if (!live || live.qty < 1e-12) {
    throw new Error(`No open ${params.side} position on Bybit for ${params.symbol}`);
  }
  const closeQty = Math.min(params.qty, live.qty);
  const closeSide = params.side === "long" ? "Sell" : "Buy";
  const data = await requestSignedPost(
    "/v5/order/create",
    {
      category: "linear",
      symbol: params.symbol,
      side: closeSide,
      orderType: "Market",
      qty: formatBybitQty(closeQty),
      positionIdx: 0,
      reduceOnly: true,
    },
    apiKey,
    apiSecret,
    environment,
  );
  const orderId = String((data.result as Record<string, unknown> | undefined)?.orderId ?? "");

  let remaining = live.qty;
  for (let i = 0; i < 15; i += 1) {
    await sleep(400);
    const after = await findBybitPosition(apiKey, apiSecret, params.symbol, params.side, environment);
    remaining = after?.qty ?? 0;
    const closedAmt = live.qty - remaining;
    if (closedAmt + 1e-6 >= closeQty || remaining < 1e-12) {
      return { orderId, closedQty: Math.min(closeQty, closedAmt || closeQty), remainingQty: remaining };
    }
  }
  const after = await findBybitPosition(apiKey, apiSecret, params.symbol, params.side, environment);
  remaining = after?.qty ?? live.qty;
  if (Math.abs(live.qty - remaining) < 1e-6) {
    throw new Error("Bybit did not confirm position close — size unchanged after market order");
  }
  return { orderId, closedQty: live.qty - remaining, remainingQty: remaining };
}

/** @deprecated Use bybitMarketCloseVerified */
export async function bybitMarketClose(
  apiKey: string,
  apiSecret: string,
  params: { symbol: string; side: "long" | "short"; qty: number },
  environment: BybitEnvironment = "demo",
): Promise<void> {
  await bybitMarketCloseVerified(apiKey, apiSecret, params, environment);
}

export async function bybitUpdateStops(
  apiKey: string,
  apiSecret: string,
  params: { symbol: string; stopPrice: number; targetPrice: number },
  environment: BybitEnvironment = "demo",
): Promise<void> {
  await requestSignedPost(
    "/v5/position/trading-stop",
    {
      category: "linear",
      symbol: params.symbol,
      positionIdx: 0,
      stopLoss: String(params.stopPrice),
      takeProfit: String(params.targetPrice),
      tpTriggerBy: "MarkPrice",
      slTriggerBy: "MarkPrice",
    },
    apiKey,
    apiSecret,
    environment,
  );
}

export async function fetchBybitWallet(
  apiKey: string,
  apiSecret: string,
  environment: BybitEnvironment = "demo",
) {
  const data = await requestSignedGet(
    "/v5/account/wallet-balance",
    { accountType: "UNIFIED" },
    apiKey,
    apiSecret,
    environment,
  );
  const list = (data.result as { list?: unknown[] } | undefined)?.list ?? [];
  const account = list[0] as Record<string, unknown> | undefined;
  const coins = (account?.coin as unknown[]) ?? [];
  const usdt = coins.find((c) => c && typeof c === "object" && (c as Record<string, unknown>).coin === "USDT") as
    | Record<string, unknown>
    | undefined;
  return {
    totalWalletBalance: parseFloat(String(usdt?.walletBalance ?? 0)),
    availableBalance: parseFloat(String(usdt?.availableToWithdraw ?? usdt?.walletBalance ?? 0)),
    equity: parseFloat(String(usdt?.equity ?? usdt?.walletBalance ?? 0)),
  };
}

export async function fetchBybitClosedPnlRaw(
  apiKey: string,
  apiSecret: string,
  params: Record<string, string>,
  environment: BybitEnvironment = "demo",
): Promise<Record<string, unknown>> {
  return requestSignedGet("/v5/position/closed-pnl", params, apiKey, apiSecret, environment);
}

export async function fetchBybitExecutions(
  apiKey: string,
  apiSecret: string,
  opts: { symbol?: string; orderId?: string; limit?: number } = {},
  environment: BybitEnvironment = "demo",
): Promise<BybitExecutionRow[]> {
  const params: Record<string, string> = {
    category: "linear",
    limit: String(Math.min(100, opts.limit ?? 50)),
  };
  if (opts.symbol) params.symbol = opts.symbol;
  if (opts.orderId) params.orderId = opts.orderId;
  const data = await requestSignedGet("/v5/execution/list", params, apiKey, apiSecret, environment);
  const list = (data.result as { list?: unknown[] } | undefined)?.list ?? [];
  const out: BybitExecutionRow[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    out.push({
      execId: String(r.execId ?? ""),
      orderId: String(r.orderId ?? ""),
      symbol: String(r.symbol ?? ""),
      side: String(r.side ?? ""),
      execPrice: parseFloat(String(r.execPrice ?? 0)),
      execQty: parseFloat(String(r.execQty ?? 0)),
      execFee: parseFloat(String(r.execFee ?? 0)),
      execTime: String(r.execTime ?? ""),
      isMaker: String(r.isMaker) === "true" || r.isMaker === true,
    });
  }
  return out;
}

export type BybitExecutionRow = {
  execId: string;
  orderId: string;
  symbol: string;
  side: string;
  execPrice: number;
  execQty: number;
  execFee: number;
  execTime: string;
  isMaker: boolean;
};

export async function syncBybitSnapshot(
  apiKey: string,
  apiSecret: string,
  symbol?: string,
  environment: BybitEnvironment = "demo",
) {
  const [positions, open_orders, wallet] = await Promise.all([
    fetchBybitPositions(apiKey, apiSecret, environment),
    fetchBybitOpenOrders(apiKey, apiSecret, symbol, environment),
    fetchBybitWallet(apiKey, apiSecret, environment),
  ]);
  return { positions, open_orders, wallet, environment };
}
