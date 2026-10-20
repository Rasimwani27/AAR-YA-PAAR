import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  parsePythonJson,
  pythonBacktestArgs,
  pythonCommand,
  repoRoot,
} from "@/lib/aar-paths";
import { readCachedReport, writeCachedReport } from "@/lib/backtest-cache";
import { SMOKE_CONFIG } from "@/lib/backtest-config";

export type JobStatus = "queued" | "running" | "done" | "error";

export type BacktestJob = {
  id: string;
  status: JobStatus;
  config: string;
  start: string;
  end: string;
  createdAt: number;
  error?: string;
  fetchError?: unknown;
  data?: unknown;
};

declare global {
  // eslint-disable-next-line no-var
  var __aarBacktestJobs: Map<string, BacktestJob> | undefined;
  // eslint-disable-next-line no-var
  var __aarJobQueue: BacktestJob[] | undefined;
  // eslint-disable-next-line no-var
  var __aarBacktestRunning: boolean | undefined;
}

const RUN_OUTPUT = "out/reports/_api-run.json";

function jobs(): Map<string, BacktestJob> {
  if (!globalThis.__aarBacktestJobs) {
    globalThis.__aarBacktestJobs = new Map();
  }
  return globalThis.__aarBacktestJobs;
}

function queue(): BacktestJob[] {
  if (!globalThis.__aarJobQueue) {
    globalThis.__aarJobQueue = [];
  }
  return globalThis.__aarJobQueue;
}

function jobMetaPath(root: string, id: string): string {
  return path.join(root, "out", "reports", "jobs", `${id}.json`);
}

function persistJobMeta(root: string, job: BacktestJob): void {
  const p = jobMetaPath(root, job.id);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(
    p,
    JSON.stringify({
      id: job.id,
      status: job.status,
      config: job.config,
      start: job.start,
      end: job.end,
      createdAt: job.createdAt,
      error: job.error,
      fetchError: job.fetchError,
    }),
    "utf-8",
  );
}

function hydrateJobFromDisk(id: string): BacktestJob | undefined {
  const root = repoRoot();
  const p = jobMetaPath(root, id);
  if (!existsSync(p)) {
    return undefined;
  }
  try {
    const meta = JSON.parse(readFileSync(p, "utf-8")) as BacktestJob;
    if (meta.status === "done" && !meta.data) {
      meta.data =
        readCachedReport(meta.config, meta.start, meta.end) ??
        readRunOutputFile(root);
    }
    jobs().set(id, meta);
    return meta;
  } catch {
    return undefined;
  }
}

function isErrorPayload(data: unknown): data is { ok: false; error: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    "ok" in data &&
    (data as { ok: boolean }).ok === false &&
    "error" in data
  );
}

function isReportPayload(data: unknown): data is { summary: unknown; meta: unknown } {
  return (
    typeof data === "object" &&
    data !== null &&
    "summary" in data &&
    "meta" in data &&
    typeof (data as { summary: unknown }).summary === "object"
  );
}

function readRunOutputFile(root: string): unknown | null {
  const outPath = path.join(root, RUN_OUTPUT);
  if (!existsSync(outPath)) {
    return null;
  }
  try {
    const data = JSON.parse(readFileSync(outPath, "utf-8"));
    return isReportPayload(data) ? data : null;
  } catch {
    return null;
  }
}

/** Windows often leaves stdout empty for long runs; always prefer --output file when present. */
function readBacktestResult(root: string, stdout: string, stderr: string): unknown {
  const fromFile = readRunOutputFile(root);
  if (fromFile) {
    return fromFile;
  }

  const trimmed = stdout.trim();
  if (trimmed) {
    const data = parsePythonJson(trimmed);
    if (isErrorPayload(data)) {
      return data;
    }
    if (isReportPayload(data)) {
      return data;
    }
  }

  const err = stderr.trim();
  if (err) {
    throw new Error(err);
  }
  throw new Error(
    "Backtest finished but no JSON was returned. Check Python in the npm window and out/reports/_api-run.json.",
  );
}

export function getJob(id: string): BacktestJob | undefined {
  const mem = jobs().get(id);
  if (mem) {
    if (mem.status === "done" && !mem.data) {
      const root = repoRoot();
      mem.data =
        readCachedReport(mem.config, mem.start, mem.end) ?? readRunOutputFile(root);
    }
    return mem;
  }
  return hydrateJobFromDisk(id);
}

export function startBacktestJob(config: string, start: string, end: string): BacktestJob {
  const id = randomUUID();
  const job: BacktestJob = {
    id,
    status: "queued",
    config,
    start,
    end,
    createdAt: Date.now(),
  };
  jobs().set(id, job);
  persistJobMeta(repoRoot(), job);
  queue().push(job);
  void pumpQueue();
  return job;
}

async function pumpQueue(): Promise<void> {
  if (globalThis.__aarBacktestRunning) {
    return;
  }
  const next = queue().shift();
  if (!next) {
    return;
  }
  globalThis.__aarBacktestRunning = true;
  next.status = "running";
  persistJobMeta(repoRoot(), next);
  await runPython(next);
  globalThis.__aarBacktestRunning = false;
  void pumpQueue();
}

async function runPython(job: BacktestJob): Promise<void> {
  const root = repoRoot();
  const cfgPath = path.join(root, job.config);
  if (!existsSync(cfgPath)) {
    job.status = "error";
    job.error = `Config not found: ${job.config}`;
    persistJobMeta(root, job);
    return;
  }

  const cmd = pythonCommand();
  const extra =
    job.config === SMOKE_CONFIG
      ? ["--output", RUN_OUTPUT]
      : ["--start", job.start, "--end", job.end, "--output", RUN_OUTPUT];
  const args = pythonBacktestArgs(job.config, extra);

  await new Promise<void>((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: root,
      env: { ...process.env, AAR_NO_REST: "1", PYTHONUNBUFFERED: "1" },
      shell: process.platform === "win32",
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    proc.on("error", (err) => {
      job.status = "error";
      job.error = `Could not start Python (${cmd}): ${err.message}`;
      persistJobMeta(root, job);
      resolve();
    });
    proc.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      try {
        if (code !== 0) {
          try {
            const errJson = parsePythonJson(stdout || stderr);
            if (isErrorPayload(errJson)) {
              job.status = "error";
              job.error = errJson.error;
              job.fetchError = errJson;
              return;
            }
          } catch {
            /* fall through */
          }
          job.status = "error";
          job.error = stderr.trim() || stdout.trim() || `Python exit ${code}`;
          return;
        }

        const data = readBacktestResult(root, stdout, stderr);
        if (isErrorPayload(data)) {
          job.status = "error";
          job.error = data.error;
          job.fetchError = data;
          return;
        }

        writeCachedReport(job.config, data, job.start, job.end);
        job.status = "done";
        job.data = data;
      } catch (e) {
        job.status = "error";
        job.error = e instanceof Error ? e.message : "Invalid backtest JSON";
      } finally {
        persistJobMeta(root, job);
        resolve();
      }
    });
  });
}
