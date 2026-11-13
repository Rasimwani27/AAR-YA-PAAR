import { NextResponse } from "next/server";

import { repoRoot } from "@/lib/aar-paths";
import { isHostedServer } from "@/lib/hosted-mode";
import { timerAction, touchSessionTimer } from "@/lib/session-timer";

export const runtime = "nodejs";

export async function GET() {
  if (isHostedServer()) {
    return NextResponse.json({
      ok: true,
      running: false,
      started_at: null,
      elapsed_ms: 0,
      display: "0:00",
      label: "Trading session",
      history: [],
    });
  }
  return NextResponse.json({ ok: true, ...touchSessionTimer(repoRoot()) });
}

export async function POST(req: Request) {
  if (isHostedServer()) {
    return NextResponse.json({ ok: false, error: "Timer is local-only." }, { status: 503 });
  }
  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const action = body.action;
  if (action !== "start" && action !== "stop" && action !== "reset") {
    return NextResponse.json({ ok: false, error: "action must be start, stop, or reset" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...timerAction(repoRoot(), action) });
}
