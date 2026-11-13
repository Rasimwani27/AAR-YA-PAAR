import { NextResponse } from "next/server";

import { probeTestnetAccount } from "@/lib/binance-testnet";

export const runtime = "nodejs";

/** @deprecated Prefer POST /api/binance/test — same behavior, always Node. */
export async function POST(req: Request) {
  let body: { apiKey?: string; apiSecret?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const apiKey = (body.apiKey ?? "").trim();
  const apiSecret = (body.apiSecret ?? "").trim();
  if (!apiKey || !apiSecret) {
    return NextResponse.json({ ok: false, error: "API key and secret are required" }, { status: 400 });
  }

  try {
    const data = await probeTestnetAccount(apiKey, apiSecret);
    return NextResponse.json({ ok: true, data, mode: "online" });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Binance probe failed" },
      { status: 400 },
    );
  }
}
