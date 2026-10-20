import { apiFetch, apiUrl, formatFetchError, pingDashboard } from "@/lib/api-fetch";
import { DEFAULT_RANGE, SMOKE_CONFIG, SMOKE_RANGE } from "@/lib/backtest-config";
import type { BacktestReport } from "@/lib/types";

const POLL_MS = 2000;
const MAX_POLLS = 600;
const POLL_FETCH_RETRIES = 10;
const MAX_CONSECUTIVE_POLL_FAILURES = 30;

export type RunResult =
  | { ok: true; data: BacktestReport; cached: boolean }
  | { ok: false; error: string; fetchError?: unknown; disconnect?: boolean };

const JOB_STORAGE_KEY = "aar-active-backtest-job";
const RUN_PARAMS_KEY = "aar-last-run-params";

type RunParams = { jobId?: string; config: string; start: string; end: string };

function saveActiveJob(id: string, params: Omit<RunParams, "jobId">): void {
  try {
    sessionStorage.setItem(JOB_STORAGE_KEY, id);
    sessionStorage.setItem(RUN_PARAMS_KEY, JSON.stringify({ ...params, jobId: id }));
  } catch {
    /* ignore */
  }
}

function clearActiveJob(): void {
  try {
    sessionStorage.removeItem(JOB_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function lastRunParams(): RunParams | null {
  try {
    const raw = sessionStorage.getItem(RUN_PARAMS_KEY);
    return raw ? (JSON.parse(raw) as RunParams) : null;
  } catch {
    return null;
  }
}

async function tryLoadCachedReport(start: string, end: string): Promise<RunResult | null> {
  try {
    const q = new URLSearchParams({ start, end });
    const res = await apiFetch(`/api/backtest?${q}`, undefined, 6);
    const body = await res.json();
    if (body.ok && body.data?.summary) {
      return { ok: true, data: body.data as BacktestReport, cached: true };
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function postStart(payload: Record<string, string>): Promise<Response> {
  const body = JSON.stringify(payload);
  const headers = { "Content-Type": "application/json" };
  try {
    return await apiFetch("/api/backtest", { method: "POST", headers, body }, 8);
  } catch {
    return await apiFetch("/api", { method: "POST", headers, body }, 8);
  }
}

async function pollJob(jobId: string): Promise<Response> {
  const q = encodeURIComponent(jobId);
  try {
    return await apiFetch(`/api/backtest?jobId=${q}`, undefined, POLL_FETCH_RETRIES);
  } catch {
    return await apiFetch(`/api?jobId=${q}`, undefined, POLL_FETCH_RETRIES);
  }
}

async function waitForJob(
  jobId: string,
  onProgress?: (status: string) => void,
): Promise<RunResult> {
  let consecutiveFailures = 0;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));

    let pollRes: Response;
    try {
      pollRes = await pollJob(jobId);
      consecutiveFailures = 0;
    } catch (e) {
      consecutiveFailures += 1;
      onProgress?.(`reconnecting (${consecutiveFailures})`);
      if (consecutiveFailures < MAX_CONSECUTIVE_POLL_FAILURES) {
        continue;
      }
      clearActiveJob();
      const pingOk = await pingDashboard();
      if (pingOk) {
        const params = lastRunParams();
        if (params?.start && params?.end) {
          const cached = await tryLoadCachedReport(params.start, params.end);
          if (cached) {
            clearActiveJob();
            return cached;
          }
        }
        return {
          ok: false,
          disconnect: true,
          error:
            `Connection dropped while polling a long backtest (this is common on Windows).\n\n` +
            `The server at ${apiUrl("/api/ping")} is up, but the browser lost contact mid-wait.\n\n` +
            `What to do:\n` +
            `1. Watch the npm/cmd window — if Python is still running, let it finish\n` +
            `2. When it finishes, run the **same date range** again (loads from out/reports/ cache)\n\n` +
            `Job id (for support): ${jobId}`,
        };
      }
      return {
        ok: false,
        error: formatFetchError(e, "/api/backtest", "backtest-poll"),
      };
    }

    let body: Record<string, unknown>;
    try {
      body = await pollRes.json();
    } catch {
      consecutiveFailures += 1;
      if (consecutiveFailures < MAX_CONSECUTIVE_POLL_FAILURES) {
        continue;
      }
      return {
        ok: false,
        error: formatFetchError(new Error("Invalid JSON from poll"), "/api/backtest", "backtest-poll"),
      };
    }

    if (pollRes.status === 404 && body.error === "Unknown job id") {
      const params = lastRunParams();
      if (params?.start && params?.end) {
        const cached = await tryLoadCachedReport(params.start, params.end);
        if (cached) {
          clearActiveJob();
          return cached;
        }
      }
      clearActiveJob();
      const pingOk = await pingDashboard();
      return {
        ok: false,
        disconnect: true,
        error:
          `Backtest job was lost (Next.js restarted during a long run).\n\n` +
          (pingOk
            ? `If Python already finished in the npm window, click Run again for the same dates — results are read from out/reports/ cache.`
            : `Restart ${apiUrl("/")} with START-HERE-43123.bat or START-HERE.bat, then re-run.`),
      };
    }

    if (body.status === "done" && body.data && typeof body.data === "object" && "summary" in (body.data as object)) {
      clearActiveJob();
      return { ok: true, data: body.data as BacktestReport, cached: false };
    }
    if (body.status === "error" || (!pollRes.ok && body.error)) {
      clearActiveJob();
      return {
        ok: false,
        error: (body.error as string) || "Backtest failed",
        fetchError: body.fetchError,
      };
    }
    onProgress?.((body.status as string) ?? "running");
  }

  clearActiveJob();
  return { ok: false, error: "Backtest timed out after 20 minutes. Try a shorter date range or Quick test." };
}

export async function runBacktestViaJob(
  payload: Record<string, string>,
  onProgress?: (status: string) => void,
): Promise<RunResult> {
  let startRes: Response;
  try {
    startRes = await postStart(payload);
  } catch (e) {
    return {
      ok: false,
      error: formatFetchError(e, "/api/backtest", "backtest-poll"),
    };
  }

  let started: Record<string, unknown>;
  try {
    started = await startRes.json();
  } catch {
    return {
      ok: false,
      error: `Server returned non-JSON (${startRes.status}). Wrong app on this port? Ping: ${apiUrl("/api/ping")}`,
    };
  }

  if (!startRes.ok) {
    return { ok: false, error: (started.error as string) || "Could not start backtest job" };
  }

  const jobId = started.jobId as string | undefined;
  if (!jobId) {
    const data = started.data as BacktestReport | undefined;
    if (data?.summary) {
      return { ok: true, data, cached: Boolean(started.cached) };
    }
    return { ok: false, error: "Server did not return jobId or data" };
  }

  let start = payload.start ?? "";
  let end = payload.end ?? "";
  const config = payload.config ?? "";
  if (config === SMOKE_CONFIG) {
    start = SMOKE_RANGE.start;
    end = SMOKE_RANGE.end;
  } else if (!start || !end) {
    start = DEFAULT_RANGE.start;
    end = DEFAULT_RANGE.end;
  }
  saveActiveJob(jobId, { config, start, end });
  onProgress?.((started.status as string) ?? "queued");
  const result = await waitForJob(jobId, onProgress);
  if (!result.ok && start && end) {
    const cached = await tryLoadCachedReport(start, end);
    if (cached) {
      clearActiveJob();
      return cached;
    }
  }
  return result;
}

/** Resume polling after refresh if a job was in flight this session. */
export async function resumeBacktestJobIfAny(onProgress?: (status: string) => void): Promise<RunResult | null> {
  let jobId: string | null = null;
  try {
    jobId = sessionStorage.getItem(JOB_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!jobId) {
    return null;
  }
  onProgress?.("resuming");
  return waitForJob(jobId, onProgress);
}
