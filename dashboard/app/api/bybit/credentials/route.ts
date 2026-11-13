import { NextResponse } from "next/server";

import { repoRoot } from "@/lib/aar-paths";
import {
  clearBybitCredentials,
  loadBybitCredentials,
  readAllConnectionMeta,
  readConnectionMeta,
  resolveBybitCredentials,
  saveBybitCredentials,
  verifyBybitConnection,
} from "@/lib/bybit-credentials";
import { parseBybitEnvironment } from "@/lib/bybit-environment";
import { isHostedServer } from "@/lib/hosted-mode";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (isHostedServer()) {
    return NextResponse.json({
      ok: true,
      connections: readAllConnectionMeta(repoRoot()),
      message: "Local-only credential vault.",
    });
  }
  const root = repoRoot();
  const url = new URL(req.url);
  const env = parseBybitEnvironment(url.searchParams.get("environment"), "demo");
  return NextResponse.json({ ok: true, meta: readConnectionMeta(root, env), connections: readAllConnectionMeta(root) });
}

export async function POST(req: Request) {
  if (isHostedServer()) {
    return NextResponse.json({ ok: false, error: "Credentials vault is local-only." }, { status: 503 });
  }
  const root = repoRoot();
  let body: {
    action?: string;
    apiKey?: string;
    apiSecret?: string;
    environment?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const environment = parseBybitEnvironment(body.environment, "demo");
  const action = String(body.action ?? "save");

  if (action === "disconnect") {
    clearBybitCredentials(root, environment);
    return NextResponse.json({ ok: true, meta: readConnectionMeta(root, environment), connections: readAllConnectionMeta(root) });
  }

  if (action === "test") {
    const creds = resolveBybitCredentials(root, environment, body);
    if (!creds) {
      return NextResponse.json({ ok: false, error: "No saved credentials — enter API key and secret." }, { status: 400 });
    }
    const meta = await verifyBybitConnection(root, environment, creds.apiKey, creds.apiSecret);
    return NextResponse.json({ ok: meta.status === "connected", meta });
  }

  const apiKey = String(body.apiKey ?? "").trim();
  const apiSecret = String(body.apiSecret ?? "").trim();
  if (!apiKey) {
    const stored = loadBybitCredentials(root, environment);
    if (!stored) {
      return NextResponse.json({ ok: false, error: "API key required" }, { status: 400 });
    }
    const meta = await verifyBybitConnection(root, environment, stored.apiKey, stored.apiSecret);
    return NextResponse.json({ ok: meta.status === "connected", meta });
  }
  if (!apiSecret) {
    return NextResponse.json(
      { ok: false, error: "API secret required when saving or replacing credentials." },
      { status: 400 },
    );
  }

  saveBybitCredentials(root, environment, apiKey, apiSecret);
  const meta = await verifyBybitConnection(root, environment, apiKey, apiSecret);
  return NextResponse.json({
    ok: meta.status === "connected",
    meta,
    connections: readAllConnectionMeta(root),
    error: meta.status !== "connected" ? meta.lastError : undefined,
  });
}
