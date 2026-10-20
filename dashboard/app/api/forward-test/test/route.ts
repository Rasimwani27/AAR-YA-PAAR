import { NextResponse } from "next/server";

import { runProbe } from "@/lib/forward-test-runner";
import { isHostedServer } from "@/lib/hosted-mode";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (isHostedServer()) {
    return NextResponse.json(
      { ok: false, error: "Forward test runs on your PC only — not on Vercel." },
      { status: 503 },
    );
  }
  if (process.env.AAR_DISABLE_EXEC === "1") {
    return NextResponse.json({ ok: false, error: "Exec disabled (AAR_DISABLE_EXEC=1)" }, { status: 503 });
  }

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

  const result = await runProbe(apiKey, apiSecret);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, data: result.data });
}
