import { createHmac } from "node:crypto";

const TESTNET_BASE = "https://testnet.binancefuture.com";

let timeOffsetMs = 0;
let timeOffsetFetchedAt = 0;
const TIME_OFFSET_TTL_MS = 60_000;

function sign(query: string, secret: string): string {
  return createHmac("sha256", secret).update(query).digest("hex");
}

function isTimestampError(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const code = (body as { code?: number }).code;
  return code === -1021 || code === -1022;
}

function formatBinanceError(status: number, body: unknown): Error {
  if (isTimestampError(body)) {
    return new Error(
      `Binance HTTP ${status}: clock out of sync with Binance (${JSON.stringify(body)}). ` +
        `On Windows: Settings -> Time & language -> Date & time -> turn on Set time automatically, then Sync now. ` +
        `The app will also use Binance server time on retry.`,
    );
  }
  return new Error(`Binance HTTP ${status}: ${JSON.stringify(body)}`);
}

async function syncServerTime(): Promise<void> {
  const res = await fetch(`${TESTNET_BASE}/fapi/v1/time`, {
    method: "GET",
    headers: { "User-Agent": "aar-dashboard/1.0" },
    cache: "no-store",
  });
  const data = (await res.json()) as { serverTime?: number };
  if (typeof data.serverTime !== "number") {
    throw new Error("Could not read Binance server time");
  }
  timeOffsetMs = data.serverTime - Date.now();
  timeOffsetFetchedAt = Date.now();
}

async function signedTimestamp(): Promise<number> {
  if (Date.now() - timeOffsetFetchedAt > TIME_OFFSET_TTL_MS) {
    await syncServerTime();
  }
  return Date.now() + timeOffsetMs;
}

async function binanceGet(
  path: string,
  params: Record<string, string | number> = {},
  apiKey?: string,
  apiSecret?: string,
  retryOnClock = true,
): Promise<unknown> {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    p.set(k, String(v));
  }
  if (apiSecret) {
    p.set("timestamp", String(await signedTimestamp()));
    p.set("recvWindow", "10000");
    const q = p.toString();
    p.set("signature", sign(q, apiSecret));
  }
  const url = `${TESTNET_BASE}${path}?${p.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "aar-dashboard/1.0",
      ...(apiKey ? { "X-MBX-APIKEY": apiKey } : {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { msg: text };
  }
  if (!res.ok) {
    if (retryOnClock && apiSecret && isTimestampError(body)) {
      await syncServerTime();
      return binanceGet(path, params, apiKey, apiSecret, false);
    }
    throw formatBinanceError(res.status, body);
  }
  return body;
}

export type BinanceProbeResult = {
  ok: true;
  testnet: boolean;
  canTrade?: boolean;
  totalWalletBalance?: string;
  availableBalance?: string;
  source: "node" | "python";
};

/** Testnet account probe — runs on Vercel (Node) without Python. Keys are not stored. */
export async function probeTestnetAccount(apiKey: string, apiSecret: string): Promise<BinanceProbeResult> {
  await syncServerTime();
  await binanceGet("/fapi/v1/ping");
  const acct = (await binanceGet("/fapi/v2/account", {}, apiKey, apiSecret)) as Record<string, unknown>;
  const assets = (acct.assets as { asset?: string; availableBalance?: string }[]) ?? [];
  const usdt = assets.find((a) => a.asset === "USDT");
  return {
    ok: true,
    testnet: true,
    canTrade: acct.canTrade as boolean | undefined,
    totalWalletBalance: acct.totalWalletBalance as string | undefined,
    availableBalance: usdt?.availableBalance,
    source: "node",
  };
}

export async function fetchTestnetPositions(apiKey: string, apiSecret: string) {
  await syncServerTime();
  const data = (await binanceGet("/fapi/v2/positionRisk", {}, apiKey, apiSecret)) as Record<string, unknown>[];
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => {
      const amt = parseFloat(String(row.positionAmt ?? 0));
      if (Math.abs(amt) < 1e-12) return null;
      return {
        symbol: row.symbol,
        side: amt > 0 ? ("long" as const) : ("short" as const),
        qty: Math.abs(amt),
        entry_price: parseFloat(String(row.entryPrice ?? 0)),
        mark_price: parseFloat(String(row.markPrice ?? 0)),
        unrealized_pnl: parseFloat(String(row.unRealizedProfit ?? 0)),
        leverage: row.leverage,
      };
    })
    .filter(Boolean);
}
