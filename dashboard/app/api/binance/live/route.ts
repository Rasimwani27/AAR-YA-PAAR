import { NextResponse } from "next/server";

import { fetchTestnetPositions, probeTestnetAccount } from "@/lib/binance-testnet";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { apiKey?: string; apiSecret?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const apiKey = (body.apiKey ?? "").trim();
  const apiSecret = (body.apiSecret ?? "").trim();
  if (!apiKey || !apiSecret) {
    return NextResponse.json({ ok: false, error: "API key and secret required" }, { status: 400 });
  }

  try {
    const probe = await probeTestnetAccount(apiKey, apiSecret);
    const positions = await fetchTestnetPositions(apiKey, apiSecret);
    return NextResponse.json({
      ok: true,
      mode: "online",
      probe,
      exchange_positions: positions,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Binance request failed" },
      { status: 400 },
    );
  }
}
