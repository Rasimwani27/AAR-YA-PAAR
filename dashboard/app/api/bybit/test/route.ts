import { NextResponse } from "next/server";

import { parseBybitEnvironment } from "@/lib/bybit-environment";
import { probeBybitAccount } from "@/lib/bybit-probe";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { apiKey?: string; apiSecret?: string; environment?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const apiKey = (body.apiKey ?? "").trim();
  const apiSecret = (body.apiSecret ?? "").trim();
  const environment = parseBybitEnvironment(body.environment, "demo");
  if (!apiKey || !apiSecret) {
    return NextResponse.json({ ok: false, error: "API key and secret required" }, { status: 400 });
  }

  try {
    const data = await probeBybitAccount(apiKey, apiSecret, environment);
    return NextResponse.json({ ok: true, data, mode: "online", environment });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bybit probe failed";
    return NextResponse.json({ ok: false, error: msg, environment }, { status: 400 });
  }
}
