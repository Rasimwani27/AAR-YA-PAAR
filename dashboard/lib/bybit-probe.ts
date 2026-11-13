/**
 * Bybit demo trading API probe (Node, no Python).
 * Mirrors `tools/bybit_api_probe.py` / `aar/live/bybit_demo.py` for REST v5.
 */

import { createHmac } from "node:crypto";

import { type BybitEnvironment, bybitRestBase } from "@/lib/bybit-environment";

const DEMO_BASE = "https://api-demo.bybit.com";
const PUBLIC_BASE = "https://api.bybit.com";
const RECV_WINDOW = "50000";
const BYBIT_FETCH_TIMEOUT_MS = 14_000;

async function bybitFetch(url: string, init: RequestInit): Promise<Response> {
  const signal =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(BYBIT_FETCH_TIMEOUT_MS)
      : undefined;
  try {
    return await fetch(url, { ...init, signal });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new Error("Bybit API timed out (14s). Try again from your home PC.");
    }
    throw e;
  }
}

/** Human-readable when CloudFront / Bybit blocks the server region (common on Vercel + some VPN/datacenters). */
export function formatBybitReachabilityError(status: number, body: string): string {
  const lower = body.toLowerCase();
  if (
    lower.includes("block access from your country") ||
    lower.includes("cloudfront") ||
    lower.includes("not available in your country")
  ) {
    return (
      "Bybit blocked this network region (HTTP " +
      status +
      "). Demo keys still work from your home PC: run the dashboard locally with START-HERE-43123.bat, or deploy only after testing where Bybit allows API access."
    );
  }
  const trimmed = body.replace(/\s+/g, " ").trim();
  if (trimmed.length > 280) {
    return `Bybit HTTP ${status}: ${trimmed.slice(0, 280)}…`;
  }
  return `Bybit HTTP ${status}: ${trimmed || "(empty body)"}`;
}

function sortedQs(params: Record<string, string>): string {
  const keys = Object.keys(params).sort();
  return keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join("&");
}

function signV5(timestamp: string, apiKey: string, recvWindow: string, payload: string, secret: string): string {
  const raw = `${timestamp}${apiKey}${recvWindow}${payload}`;
  return createHmac("sha256", secret).update(raw).digest("hex");
}

async function requestPublic(path: string, params: Record<string, string>): Promise<unknown> {
  const qs = sortedQs(params);
  const url = qs ? `${PUBLIC_BASE}${path}?${qs}` : `${PUBLIC_BASE}${path}`;
  const res = await bybitFetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; AAR-dashboard/1.0)",
    },
  });
  const body = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = body ? (JSON.parse(body) as Record<string, unknown>) : {};
  } catch {
    throw new Error(formatBybitReachabilityError(res.status, body));
  }
  if (!res.ok) {
    throw new Error(formatBybitReachabilityError(res.status, body));
  }
  if (data && typeof data === "object" && "retCode" in data && data.retCode != null && data.retCode !== 0 && data.retCode !== "0") {
    throw new Error(`Bybit ${path}: ${body}`);
  }
  return data;
}

async function requestSignedGet(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  apiSecret: string,
  environment: BybitEnvironment = "demo",
): Promise<unknown> {
  const qs = sortedQs(params);
  const ts = String(Date.now());
  const sign = signV5(ts, apiKey, RECV_WINDOW, qs, apiSecret);
  const url = `${bybitRestBase(environment)}${path}?${qs}`;
  const res = await bybitFetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "aar-dashboard/1.0",
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-SIGN": sign,
      "X-BAPI-SIGN-TYPE": "2",
      "X-BAPI-TIMESTAMP": ts,
      "X-BAPI-RECV-WINDOW": RECV_WINDOW,
    },
  });
  const body = await res.text();
  let data: Record<string, unknown>;
  try {
    data = body ? (JSON.parse(body) as Record<string, unknown>) : {};
  } catch {
    throw new Error(formatBybitReachabilityError(res.status, body));
  }
  if (!res.ok) {
    throw new Error(formatBybitReachabilityError(res.status, body));
  }
  const rc = data.retCode;
  if (rc != null && rc !== 0 && rc !== "0") {
    throw new Error(`Bybit ${path}: ${body}`);
  }
  return data;
}

function klineParams(symbol: string, interval: string, limit: number): Record<string, string> {
  const iv = interval.endsWith("m") && /^\d+m$/.test(interval) ? interval.slice(0, -1) : interval;
  return {
    category: "linear",
    symbol,
    interval: iv,
    limit: String(Math.min(1000, Math.max(1, limit))),
  };
}

export type BybitProbeResult = {
  ok: boolean;
  exchange: string;
  testnet: boolean;
  canTrade: boolean;
  totalWalletBalance: string | null;
  availableBalance: string | null;
  updateTime: null;
  klines_sample: number;
};

/** Wallet + one tiny kline sample — same shape as Python probe. */
export async function probeBybitAccount(
  apiKey: string,
  apiSecret: string,
  environment: BybitEnvironment,
): Promise<BybitProbeResult> {
  const walletData = (await requestSignedGet(
    "/v5/account/wallet-balance",
    { accountType: "UNIFIED" },
    apiKey,
    apiSecret,
    environment,
  )) as { result?: { list?: unknown[] } };

  let coins: unknown[] = [];
  const lst = walletData.result?.list;
  if (Array.isArray(lst) && lst.length > 0) {
    const account = lst[0];
    if (account && typeof account === "object" && "coin" in account && Array.isArray((account as { coin: unknown }).coin)) {
      coins = (account as { coin: unknown[] }).coin;
    }
  }
  const usdt = coins.find((c) => typeof c === "object" && c !== null && (c as { coin?: string }).coin === "USDT") as
    | { availableToWithdraw?: string; walletBalance?: string }
    | undefined;

  let avail: string | null | undefined = usdt?.availableToWithdraw;
  if (avail == null && usdt) {
    avail = usdt.walletBalance;
  }
  const total = usdt?.walletBalance ?? null;

  const klineJson = (await requestPublic("/v5/market/kline", klineParams("BTCUSDT", "3m", 3))) as {
    result?: { list?: unknown[] };
  };
  const krows = klineJson.result?.list;
  const klines_sample = Array.isArray(krows) ? krows.length : 0;

  return {
    ok: true,
    exchange: environment === "mainnet" ? "bybit_mainnet" : "bybit_demo",
    testnet: false,
    canTrade: true,
    totalWalletBalance: total != null ? String(total) : null,
    availableBalance: avail != null ? String(avail) : null,
    updateTime: null,
    klines_sample,
  };
}

export async function probeBybitDemo(apiKey: string, apiSecret: string): Promise<BybitProbeResult> {
  return probeBybitAccount(apiKey, apiSecret, "demo");
}
