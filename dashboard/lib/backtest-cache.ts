import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { repoRoot } from "@/lib/aar-paths";
import { FULL_CONFIG, SMOKE_CONFIG } from "@/lib/backtest-config";

export { FULL_CONFIG, SMOKE_CONFIG };

export function cachePathForRun(config: string, start?: string, end?: string): string {
  const root = repoRoot();
  if (start && end) {
    const safe = `${start}_${end}`.replace(/[^\d-]/g, "");
    return path.join(root, "out", "reports", `dashboard-${safe}.json`);
  }
  if (config === FULL_CONFIG || config.includes("fade-reversal")) {
    return path.join(root, "out", "reports", "dashboard-full.json");
  }
  if (config.includes("smoke")) {
    return path.join(root, "out", "reports", "dashboard-smoke.json");
  }
  return path.join(root, "out", "reports", "dashboard-last.json");
}

export function readLatestRunOutput(): unknown | null {
  const p = path.join(repoRoot(), "out", "reports", "_api-run.json");
  if (!existsSync(p)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

export function readCachedReport(config?: string, start?: string, end?: string): unknown | null {
  const paths = [
    start && end ? cachePathForRun(config ?? FULL_CONFIG, start, end) : null,
    config?.includes("smoke") ? cachePathForRun(SMOKE_CONFIG) : null,
    cachePathForRun(FULL_CONFIG),
    path.join(repoRoot(), "out", "reports", "dashboard-last.json"),
    path.join(repoRoot(), "out", "reports", "_api-run.json"),
  ].filter(Boolean) as string[];

  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      return JSON.parse(readFileSync(p, "utf-8"));
    } catch {
      /* next */
    }
  }
  return null;
}

export function writeCachedReport(config: string, data: unknown, start?: string, end?: string): void {
  const p = cachePathForRun(config, start, end);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
  writeFileSync(cachePathForRun(config), JSON.stringify(data, null, 2), "utf-8");
}
