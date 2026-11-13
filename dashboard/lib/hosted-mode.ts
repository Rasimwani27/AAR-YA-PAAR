/** True only on static Vercel deploy (no Python `aar` package). */

import { existsSync } from "node:fs";
import path from "node:path";

import { repoRoot } from "@/lib/aar-paths";

export function isHostedServer(): boolean {
  if (process.env.AAR_FORCE_LOCAL === "1") {
    return false;
  }
  if (process.env.AAR_DISABLE_EXEC === "1") {
    return true;
  }
  const root = repoRoot();
  if (existsSync(path.join(root, "aar", "__main__.py"))) {
    return false;
  }
  if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) {
    return true;
  }
  return false;
}

export const HOSTED_REPORT_PUBLIC = "/hosted-portfolio-report.json";
