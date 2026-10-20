import { spawn } from "node:child_process";
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

export function startForwardTest(configs: string, apiKey: string, apiSecret: string): ForwardTestJob {
  stopForwardTest();
  const root = repoRoot();
  const outDir = path.join(root, "out", "forward");
  mkdirSync(outDir, { recursive: true });

  const id = `fwd-${Date.now()}`;
  const job: ForwardTestJob = { id, status: "running", startedAt: Date.now() };
  globalThis.__aarForwardJob = job;

  const { command, argsPrefix } = resolvePython();
  const args = [
    ...argsPrefix,
    "tools/forward_test_run.py",
    "--configs",
    configs,
    "--poll-seconds",
    "90",
  ];

  const proc = spawn(command, args, {
    cwd: root,
    env: {
      ...process.env,
      BINANCE_API_KEY: apiKey,
      BINANCE_API_SECRET: apiSecret,
      PYTHONUNBUFFERED: "1",
    },
    shell: process.platform === "win32",
  });
  globalThis.__aarForwardProc = proc;
  job.pid = proc.pid;

  proc.stderr?.on("data", (d) => {
    const msg = d.toString().trim();
    if (msg) {
      writeFileSync(path.join(outDir, "forward.stderr.log"), msg + "\n", { flag: "a" });
    }
  });

  proc.on("close", (code) => {
    if (globalThis.__aarForwardJob?.id === id) {
      globalThis.__aarForwardJob.status = code === 0 ? "done" : "error";
      if (code !== 0) {
        globalThis.__aarForwardJob.error = `Forward test exited with code ${code}`;
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
    const proc = spawn(
      command,
      [...argsPrefix, "tools/binance_api_probe.py"],
      {
        cwd: root,
        env: {
          ...process.env,
          BINANCE_API_KEY: apiKey,
          BINANCE_API_SECRET: apiSecret,
          PYTHONUNBUFFERED: "1",
        },
        shell: process.platform === "win32",
      },
    );
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
        resolve({ ok: false, error: raw || `Probe failed (exit ${code})` });
      }
    });
  });
}

export function runOnceTick(configs: string, apiKey: string, apiSecret: string): Promise<unknown> {
  const root = repoRoot();
  const { command, argsPrefix } = resolvePython();
  return new Promise((resolve, reject) => {
    const proc = spawn(
      command,
      [...argsPrefix, "tools/forward_test_run.py", "--configs", configs, "--once"],
      {
        cwd: root,
        env: {
          ...process.env,
          BINANCE_API_KEY: apiKey,
          BINANCE_API_SECRET: apiSecret,
          PYTHONUNBUFFERED: "1",
        },
        shell: process.platform === "win32",
      },
    );
    let stdout = "";
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Tick failed exit ${code}`));
        return;
      }
      try {
        resolve(parsePythonJson(stdout));
      } catch (e) {
        reject(e);
      }
    });
  });
}
