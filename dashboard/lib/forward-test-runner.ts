import { spawn, spawnSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { parsePythonJson, repoRoot, resolvePython } from "@/lib/aar-paths";

export type ForwardTestJob = {
  id: string;
  status: "queued" | "running" | "done" | "error";
  startedAt: number;
  error?: string;
  pid?: number;
};

declare global {
  var __aarForwardJob: ForwardTestJob | undefined;
  var __aarForwardProc: ReturnType<typeof spawn> | undefined;
}

function statePath(root: string) {
  return path.join(root, "out", "forward", "state.json");
}

function writeForwardError(root: string, message: string) {
  const outDir = path.join(root, "out", "forward");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    statePath(root),
    JSON.stringify({ ok: false, error: message, updated_at: new Date().toISOString() }, null, 2),
    "utf-8",
  );
}

export type ForwardExchange = "binance" | "bybit";

function pythonEnv(
  root: string,
  apiKey: string,
  apiSecret: string,
  forwardExchange: ForwardExchange,
): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = {
    ...process.env,
    AAR_REPO_ROOT: root,
    PYTHONUNBUFFERED: "1",
    AAR_FORWARD_EXCHANGE: forwardExchange,
  };
  if (forwardExchange === "bybit") {
    return { ...base, BYBIT_API_KEY: apiKey, BYBIT_API_SECRET: apiSecret };
  }
  return { ...base, BINANCE_API_KEY: apiKey, BINANCE_API_SECRET: apiSecret };
}

/** Never use shell:true — API secrets often contain & % ! which break cmd.exe. */
function spawnPython(
  args: string[],
  root: string,
  apiKey: string,
  apiSecret: string,
  forwardExchange: ForwardExchange,
): ReturnType<typeof spawn> {
  const { command, argsPrefix } = resolvePython();
  return spawn(command, [...argsPrefix, ...args], {
    cwd: root,
    env: pythonEnv(root, apiKey, apiSecret, forwardExchange),
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function readForwardState(root: string): unknown {
  const p = statePath(root);
  if (!existsSync(p)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

export function getForwardJob(): ForwardTestJob | null {
  return globalThis.__aarForwardJob ?? null;
}

export function stopForwardTest(): void {
  globalThis.__aarForwardProc?.kill();
  globalThis.__aarForwardProc = undefined;
  if (globalThis.__aarForwardJob) {
    globalThis.__aarForwardJob.status = "done";
  }
}

export function parseExitError(stdout: string, stderr: string, code: number | null): string {
  const raw = stdout.trim() || stderr.trim();
  try {
    const data = parsePythonJson(raw || stdout) as { ok?: boolean; error?: string };
    if (data?.error) return String(data.error);
  } catch {
    /* fall through */
  }
  if (/ENOENT|not found/i.test(stderr) || /'py' is not recognized/i.test(stderr)) {
    return (
      "Python not found. Install Python 3 from https://www.python.org/downloads/ " +
      "(tick Add to PATH), then restart START-HERE-43123.bat."
    );
  }
  if (/was unexpected at this time/i.test(stderr)) {
    return (
      "Windows cmd rejected the command (often special characters in API secret). " +
      "Updated build passes keys via env only — pull latest zip and restart START-HERE-43123.bat."
    );
  }
  return raw || `Forward test exited with code ${code ?? "?"}`;
}

export function startForwardTest(
  configs: string,
  apiKey: string,
  apiSecret: string,
  forwardExchange: ForwardExchange = "bybit",
): ForwardTestJob {
  stopForwardTest();
  const root = repoRoot();
  const outDir = path.join(root, "out", "forward");
  mkdirSync(outDir, { recursive: true });

  const id = `fwd-${Date.now()}`;
  const job: ForwardTestJob = { id, status: "running", startedAt: Date.now() };
  globalThis.__aarForwardJob = job;

  const proc = spawnPython(
    [
      "tools/forward_test_run.py",
      "--exchange",
      forwardExchange,
      "--configs",
      configs,
      "--poll-seconds",
      "90",
      "--skip-probe",
    ],
    root,
    apiKey,
    apiSecret,
    forwardExchange,
  );
  globalThis.__aarForwardProc = proc;
  job.pid = proc.pid;

  let stdout = "";
  let stderr = "";

  proc.stdout?.on("data", (d) => {
    stdout += d.toString();
  });

  proc.stderr?.on("data", (d) => {
    const chunk = d.toString();
    stderr += chunk;
    const msg = chunk.trim();
    if (msg) {
      writeFileSync(path.join(outDir, "forward.stderr.log"), msg + "\n", { flag: "a" });
    }
  });

  proc.on("error", (err) => {
    if (globalThis.__aarForwardJob?.id === id) {
      globalThis.__aarForwardJob.status = "error";
      globalThis.__aarForwardJob.error = `Could not start Python: ${err.message}`;
      writeForwardError(root, globalThis.__aarForwardJob.error);
    }
    globalThis.__aarForwardProc = undefined;
  });

  proc.on("close", (code) => {
    if (globalThis.__aarForwardJob?.id === id) {
      if (code === 0) {
        globalThis.__aarForwardJob.status = "done";
      } else {
        const errMsg = parseExitError(stdout, stderr, code);
        globalThis.__aarForwardJob.status = "error";
        globalThis.__aarForwardJob.error = errMsg;
        writeForwardError(root, errMsg);
      }
    }
    globalThis.__aarForwardProc = undefined;
  });

  return job;
}

export function runProbe(apiKey: string, apiSecret: string): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  const root = repoRoot();
  const { command, argsPrefix } = resolvePython();
  return new Promise((resolve) => {
    const proc = spawn(command, [...argsPrefix, "tools/binance_api_probe.py"], {
      cwd: root,
      env: pythonEnv(root, apiKey, apiSecret, "binance"),
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      resolve({ ok: false, error: "Probe timed out (30s)" });
    }, 30_000);
    proc.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      const raw = stdout.trim() || stderr.trim();
      try {
        const data = parsePythonJson(raw || stdout) as { ok?: boolean; error?: string };
        if (data.ok === false || code !== 0) {
          resolve({ ok: false, error: data.error ?? raw ?? `exit ${code}` });
          return;
        }
        resolve({ ok: true, data });
      } catch {
        resolve({ ok: false, error: parseExitError(stdout, stderr, code) });
      }
    });
  });
}

export async function runOnceTick(
  configs: string,
  apiKey: string,
  apiSecret: string,
  forwardExchange: ForwardExchange = "bybit",
): Promise<unknown> {
  const root = repoRoot();
  const { command, argsPrefix } = resolvePython();
  const result = spawnSync(
    command,
    [
      ...argsPrefix,
      "tools/forward_test_run.py",
      "--exchange",
      forwardExchange,
      "--configs",
      configs,
      "--once",
      "--skip-probe",
    ],
    {
      cwd: root,
      env: pythonEnv(root, apiKey, apiSecret, forwardExchange),
      shell: false,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    },
  );

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  if (result.error) {
    throw new Error(`Could not run Python: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(parseExitError(stdout, stderr, result.status));
  }
  try {
    return parsePythonJson(stdout);
  } catch (e) {
    throw new Error(parseExitError(stdout, stderr, result.status));
  }
}
