import { NextResponse } from "next/server";

import { assertLocalEngine, repoRoot } from "@/lib/aar-paths";
import { configsArg, type ForwardStrategyId } from "@/lib/forward-config";
import {
  getForwardJob,
  readForwardState,
  runOnceTick,
  startForwardTest,
  stopForwardTest,
} from "@/lib/forward-test-runner";
import { isHostedServer } from "@/lib/hosted-mode";

export const runtime = "nodejs";

export async function GET() {
  if (isHostedServer()) {
    return NextResponse.json({
      ok: true,
      mode: "hosted",
      job: null,
      state: null,
      message: "Forward test is local-only. Run START-HERE-43123.bat on your PC.",
    });
  }

  const root = repoRoot();
  const job = getForwardJob();
  const state = readForwardState(root);
  return NextResponse.json({ ok: true, job, state });
}

export async function POST(req: Request) {
  if (isHostedServer()) {
    return NextResponse.json({ ok: false, error: "Forward test not available on hosted site." }, { status: 503 });
  }
  if (process.env.AAR_DISABLE_EXEC === "1") {
    return NextResponse.json({ ok: false, error: "Exec disabled" }, { status: 503 });
  }

  const engineErr = assertLocalEngine(repoRoot());
  if (engineErr) {
    return NextResponse.json({ ok: false, error: engineErr }, { status: 503 });
  }

  let body: {
    action?: string;
    apiKey?: string;
    apiSecret?: string;
    strategies?: ForwardStrategyId[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action ?? "start";
  if (action === "stop") {
    stopForwardTest();
    return NextResponse.json({ ok: true, stopped: true });
  }

  if (action === "tick") {
    const apiKey = (body.apiKey ?? "").trim();
    const apiSecret = (body.apiSecret ?? "").trim();
    const strategies = body.strategies?.length
      ? body.strategies
      : (["fade-reversal", "london-mid-engulf"] as ForwardStrategyId[]);
    if (!apiKey || !apiSecret) {
      return NextResponse.json({ ok: false, error: "Missing API credentials" }, { status: 400 });
    }
    try {
      const data = await runOnceTick(configsArg(strategies), apiKey, apiSecret);
      return NextResponse.json({ ok: true, data });
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "Tick failed" },
        { status: 500 },
      );
    }
  }

  const apiKey = (body.apiKey ?? "").trim();
  const apiSecret = (body.apiSecret ?? "").trim();
  const strategies = body.strategies?.length
    ? body.strategies
    : (["fade-reversal", "london-mid-engulf"] as ForwardStrategyId[]);

  if (!apiKey || !apiSecret) {
    return NextResponse.json({ ok: false, error: "API key and secret required" }, { status: 400 });
  }

  const cfg = configsArg(strategies);
  if (!cfg) {
    return NextResponse.json({ ok: false, error: "Select at least one strategy" }, { status: 400 });
  }

  const job = startForwardTest(cfg, apiKey, apiSecret);
  return NextResponse.json({
    ok: true,
    job,
    message: "Forward test started (testnet, dry-run signals). Poll GET /api/forward-test for state.",
  });
}
