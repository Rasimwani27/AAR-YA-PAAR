import { NextResponse } from "next/server";

import { assertTradingLocal, repoRoot } from "@/lib/aar-paths";
import { resolveBybitCredentials } from "@/lib/bybit-credentials";
import { parseBybitEnvironment } from "@/lib/bybit-environment";
import { reconcileLedgerWithBybit } from "@/lib/bybit-reconcile";
import { fetchBybitPositions } from "@/lib/bybit-orders";
import { computeForwardStats, enrichForwardStateFromLedger, loadLedgerSnapshot } from "@/lib/forward-ledger";
import { readForwardState } from "@/lib/forward-test-runner";
import type { ForwardState } from "@/lib/forward-state";
import { isHostedServer } from "@/lib/hosted-mode";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (isHostedServer()) {
    return NextResponse.json({ ok: false, error: "Reconcile is local-only." }, { status: 503 });
  }
  const root = repoRoot();
  const engineErr = assertTradingLocal(root);
  if (engineErr) {
    return NextResponse.json({ ok: false, error: engineErr }, { status: 503 });
  }

  let body: { symbol?: string; environment?: string; apiKey?: string; apiSecret?: string };
  try {
    body = req.headers.get("content-length") ? await req.json() : {};
  } catch {
    body = {};
  }

  const environment = parseBybitEnvironment(body.environment, "demo");
  const creds = resolveBybitCredentials(root, environment, body);
  if (!creds) {
    return NextResponse.json({ ok: false, error: "No Bybit credentials" }, { status: 400 });
  }

  const symbol = String(body.symbol ?? "BTCUSDT");
  try {
    const exchangePositions = await fetchBybitPositions(creds.apiKey, creds.apiSecret, creds.environment);
    const ledger = await reconcileLedgerWithBybit(root, creds.apiKey, creds.apiSecret, {
      symbol,
      exchangePositions,
      environment: creds.environment,
    });
    let base = (readForwardState(root) as ForwardState | null) ?? { ok: true };
    base = await enrichForwardStateFromLedger(root, base);
    const state: ForwardState = {
      ...base,
      history: ledger.history.slice(0, 100),
      stats: computeForwardStats({ positions: [], history: ledger.history }, base.mark_price ?? 0),
      positions: [],
      exchange: "bybit",
      bybit_environment: creds.environment,
    };
    return NextResponse.json({ ok: true, state, reconciled: ledger.history.length });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Reconcile failed" },
      { status: 400 },
    );
  }
}
