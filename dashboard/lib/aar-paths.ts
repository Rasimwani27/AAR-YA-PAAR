import { existsSync } from "node:fs";
import path from "node:path";

function hasEngine(root: string): boolean {
  return existsSync(path.join(root, "aar", "__main__.py"));
}

/** Repo root: AAR_REPO_ROOT env, parent of dashboard/, walk up from cwd, or siblings. */
export function repoRoot(): string {
  if (process.env.AAR_REPO_ROOT) {
    const fromEnv = path.resolve(process.env.AAR_REPO_ROOT);
    if (hasEngine(fromEnv)) {
      return fromEnv;
    }
  }

  const cwd = path.resolve(process.cwd());
  if (path.basename(cwd).toLowerCase() === "dashboard") {
    const parent = path.resolve(cwd, "..");
    if (hasEngine(parent)) {
      return parent;
    }
  }

  let dir = cwd;
  for (let i = 0; i < 12; i++) {
    if (hasEngine(dir)) {
      return dir;
    }
    const parent = path.resolve(dir, "..");
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  const fallbacks = [
    path.resolve(cwd, ".."),
    path.resolve(cwd, "..", "AAR-YA-PAAR"),
    path.resolve(cwd, "AAR-YA-PAAR"),
  ];
  for (const root of fallbacks) {
    if (hasEngine(root)) {
      return root;
    }
  }
  return path.resolve(cwd, "..");
}

export type PythonLaunch = {
  command: string;
  argsPrefix: string[];
};

/** Split AAR_PYTHON="py -3" into spawn-friendly command + args (Windows-safe). */
export function resolvePython(): PythonLaunch {
  const fallback = process.platform === "win32" ? "py" : "python3";
  const raw = (process.env.AAR_PYTHON || fallback).trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { command: fallback, argsPrefix: process.platform === "win32" ? ["-3"] : [] };
  }

  const command = parts[0];
  let argsPrefix = parts.slice(1);

  if (process.platform === "win32" && command === "py" && !argsPrefix.includes("-3")) {
    argsPrefix = ["-3", ...argsPrefix];
  }

  return { command, argsPrefix };
}

export function pythonCommand(): string {
  return resolvePython().command;
}

export function pythonArgs(script: string, configPath: string, json = true): string[] {
  const { argsPrefix } = resolvePython();
  const tail: string[] = ["--config", configPath.replace(/\\/g, "/")];
  if (json) {
    tail.push("--format", "json");
  }
  const scriptNorm = script.replace(/\\/g, "/");
  return [...argsPrefix, scriptNorm, ...tail];
}

/** Relative paths from repo root — reliable on Windows with shell spawn. */
export function pythonBacktestArgs(configFile: string, extra: string[] = []): string[] {
  const { argsPrefix } = resolvePython();
  const cfg = configFile.replace(/\\/g, "/");
  return [
    ...argsPrefix,
    "tools/year_by_year_report.py",
    "--config",
    cfg,
    "--format",
    "json",
    ...extra.map((a) => a.replace(/\\/g, "/")),
  ];
}

export function assertLocalEngine(root: string): string | null {
  const script = path.join(root, "tools", "year_by_year_report.py");
  const analytics = path.join(root, "tools", "trade_analytics.py");
  const aar = path.join(root, "aar", "__main__.py");
  const smoke = path.join(root, "config.btc.fade-reversal-smoke.toml");
  if (!existsSync(aar)) {
    return `Missing aar\\ package at ${path.join(root, "aar")}. Use the full repo (run scripts\\apply-to-local.ps1), not dashboard alone.`;
  }
  if (!existsSync(script)) {
    return `Missing ${script}.`;
  }
  if (!existsSync(analytics)) {
    return `Missing ${analytics}. Run git pull for trade analytics.`;
  }
  if (!existsSync(smoke)) {
    return `Missing ${smoke}.`;
  }
  const probe = path.join(root, "tools", "binance_api_probe.py");
  const forward = path.join(root, "tools", "forward_test_run.py");
  if (!existsSync(probe)) {
    return `Missing ${probe}.`;
  }
  if (!existsSync(forward)) {
    return `Missing ${forward}.`;
  }
  return null;
}

/** Parse JSON from Python stdout even if a stray log line appears. */
export function parsePythonJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("Python produced no output");
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Could not parse JSON from Python output");
  }
}
