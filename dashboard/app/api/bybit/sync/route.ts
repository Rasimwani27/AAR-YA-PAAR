import { NextResponse } from "next/server";

import { assertTradingLocal, repoRoot } from "@/lib/aar-paths";
import { resolveBybitCredentials } from "@/lib/bybit-credentials";
import { parseBybitEnvironment } from "@/lib/bybit-environment";
import { reconcileLedgerWithBybit } from "@/lib/bybit-reconcile";
import { syncBybitSnapshot } from "@/lib/bybit-orders";
import { mergeBybitSnapshot } from "@/lib/bybit-sync";
import { computeForwardStats, enrichForwardStateFromLedger, loadLedgerSnapshot } from "@/lib/forward-ledger";
import { readForwardState } from "@/lib/forward-test-runner";
import type { ForwardState } from "@/lib/forward-state";
import { isHostedServer } from "@/lib/hosted-mode";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (isHostedServer()) {
    return NextResponse.json({ ok: false, error: "Sync is local-only." }, { status: 503 });
  }
  const root = repoRoot();
  const engineErr = assertTradingLocal(root);
  if (engineErr) {
    return NextResponse.json({ ok: false, error: engineErr }, { status: 503 });
  }

  let body: { apiKey?: string; apiSecret?: string; environment?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const environment = parseBybitEnvironment(body.environment, "demo");
  const creds = resolveBybitCredentials(root, environment, body);
  if (!creds) {
    return NextResponse.json({ ok: false, error: "No Bybit credentials — connect in the dashboard." }, { status: 400 });
  }

  try {
    const prefsSymbol = "BTCUSDT";
    const snapshot = await syncBybitSnapshot(creds.apiKey, creds.apiSecret, prefsSymbol, creds.environment);
    await reconcileLedgerWithBybit(root, creds.apiKey, creds.apiSecret, {
      symbol: prefsSymbol,
      exchangePositions: snapshot.positions,
      environment: creds.environment,
    });
    let base = (readForwardState(root) as ForwardState | null) ?? { ok: true };
    base = await enrichForwardStateFromLedger(root, base);
    const ledger = loadLedgerSnapshot(root);
    const state = mergeBybitSnapshot(
      {
        ...base,
        history: ledger.history.slice(0, 100),
        stats: computeForwardStats({ positions: [], history: ledger.history }, base.mark_price ?? 0),
        positions: [],
      },
      snapshot,
    );
    return NextResponse.json({
      ok: true,
      state: { ...state, exchange: "bybit", bybit_environment: creds.environment },
      source: creds.source,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Bybit sync failed" },
      { status: 400 },
    );
  }
}
