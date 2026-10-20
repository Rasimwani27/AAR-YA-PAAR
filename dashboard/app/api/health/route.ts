import { existsSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

import { assertLocalEngine, repoRoot, resolvePython } from "@/lib/aar-paths";
import { isHostedServer } from "@/lib/hosted-mode";

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
      message: "Hosted portfolio — forward test runs on your PC only.",
    });
  }

  const root = repoRoot();
  const engineErr = assertLocalEngine(root);
  const disableExec = process.env.AAR_DISABLE_EXEC === "1";
  const filesOk = !engineErr;
  const ok = filesOk && !disableExec;

  return NextResponse.json({
    ok,
    filesOk,
    repoRoot: root,
    cwd: process.cwd(),
    python: process.env.AAR_PYTHON || (process.platform === "win32" ? "py" : "python3"),
    pythonSpawn: `${resolvePython().command} ${resolvePython().argsPrefix.join(" ")}`.trim(),
    disableExec,
    engineError: engineErr,
    forwardTest: ok,
    hasNodeModules: existsSync(path.join(process.cwd(), "node_modules", "next")),
    hosted: false,
  });
}
