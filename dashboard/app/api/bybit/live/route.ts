import { NextResponse } from "next/server";

import { repoRoot } from "@/lib/aar-paths";
import { resolveBybitCredentials } from "@/lib/bybit-credentials";
import { parseBybitEnvironment } from "@/lib/bybit-environment";
import { syncBybitSnapshot } from "@/lib/bybit-orders";
import { probeBybitDemo } from "@/lib/bybit-probe";
import { mapPositionsToExchange } from "@/lib/bybit-sync";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { apiKey?: string; apiSecret?: string; environment?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const root = repoRoot();
  const environment = parseBybitEnvironment(body.environment, "demo");
  const creds = resolveBybitCredentials(root, environment, body);
  if (!creds) {
    return NextResponse.json({ ok: false, error: "API key and secret required (save connection first)." }, { status: 400 });
  }

  try {
    const probe = await probeBybitDemo(creds.apiKey, creds.apiSecret);
    const snapshot = await syncBybitSnapshot(creds.apiKey, creds.apiSecret, undefined, creds.environment);
    const exchange_positions = mapPositionsToExchange(snapshot.positions);
    const exchangeUnrealized = exchange_positions.reduce((sum, row) => sum + Number(row.unrealized_pnl ?? 0), 0);
    return NextResponse.json({
      ok: true,
      mode: "online",
      probe,
      exchange_positions,
      exchange_stats: {
        unrealized_usd: Math.round(exchangeUnrealized * 100) / 100,
        position_count: exchange_positions.length,
      },
      bybit_open_orders: snapshot.open_orders,
      bybit_wallet: snapshot.wallet,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Bybit request failed" },
      { status: 400 },
    );
  }
}
