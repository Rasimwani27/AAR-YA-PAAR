import { existsSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

import { assertLocalEngine, assertTradingLocal, repoRoot, resolvePython } from "@/lib/aar-paths";
import { isHostedServer } from "@/lib/hosted-mode";
import { LAB_BUILD } from "@/lib/lab-version";

export const runtime = "nodejs";

export async function GET() {
  if (isHostedServer()) {
    return NextResponse.json({
      ok: true,
      mode: "hosted",
      filesOk: true,
      repoRoot: process.cwd(),
      disableExec: true,
      engineError: null,
      hosted: true,
      forwardTest: false,
      binanceProbeOnline: true,
      labBuild: LAB_BUILD,
      message:
        "Hosted — Bybit demo / Binance testnet key probe can work here; Python forward test runs on your PC (43123).",
    });
  }

  const root = repoRoot();
  const engineErr = assertLocalEngine(root);
  const tradingErr = assertTradingLocal(root);
  const disableExec = process.env.AAR_DISABLE_EXEC === "1";
  const filesOk = !engineErr;
  const tradingOk = !tradingErr && !disableExec;
  const ok = filesOk && !disableExec;

  return NextResponse.json({
    ok: tradingOk,
    filesOk,
    tradingOk,
    repoRoot: root,
    cwd: process.cwd(),
    python: process.env.AAR_PYTHON || (process.platform === "win32" ? "py" : "python3"),
    pythonSpawn: `${resolvePython().command} ${resolvePython().argsPrefix.join(" ")}`.trim(),
    disableExec,
    engineError: engineErr,
    tradingError: tradingErr,
    forwardTest: ok,
    hasNodeModules: existsSync(path.join(process.cwd(), "node_modules", "next")),
    hosted: false,
  });
}
