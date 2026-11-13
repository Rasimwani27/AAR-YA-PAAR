/** Home engine URL when Vercel UI talks to old PC (set in Vercel env). */
export function remoteEngineBase(): string | null {
  const raw = process.env.NEXT_PUBLIC_AAR_API_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

/** Build API URL: remote engine if configured, else same-origin. */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const remote = remoteEngineBase();
  if (remote) return `${remote}${p}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${p}`;
  }
  return p;
}

export function localOrigin(): string {
  const remote = remoteEngineBase();
  if (remote) return remote;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "http://127.0.0.1:43123";
}

export function isLocalDashboard(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  const h = window.location.hostname;
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
}

export function isNetworkErrorMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("fetch") ||
    m.includes("network") ||
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("connection") ||
    m.includes("empty response")
  );
}

function localStartInstructions(origin: string): string {
  let port = "3000";
  let bat = "START-HERE.bat";
  let runBat = "dashboard\\run-dashboard.bat";
  try {
    port = new URL(origin).port || "3000";
    if (port === "43123") {
      bat = "START-HERE-43123.bat";
      runBat = "dashboard\\run-dashboard-43123.bat";
    }
  } catch {
    /* defaults */
  }
  return (
    `Fix on your PC (use the same port as this page — ${port}):\n` +
    `1. Close old terminal windows\n` +
    `2. Double-click ${bat} in the repo folder (or ${runBat})\n` +
    `3. Keep that window open until you see "Ready"\n` +
    `4. Open ${origin}/api/ping — must show {"ok":true,"service":"aar-dashboard"}\n` +
    `5. Then use ${origin}/ for the lab`
  );
}

const DEFAULT_FETCH_TIMEOUT_MS = 12_000;
const PING_FETCH_TIMEOUT_MS = 6_000;

function fetchWithTimeout(url: string, init: RequestInit | undefined, timeoutMs: number): Promise<Response> {
  const signal =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined;
  return fetch(url, { ...init, cache: "no-store", signal });
}

/** Same page origin only — use for /api/health on Vercel (ignore NEXT_PUBLIC_AAR_API_URL). */
export function sameOriginUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${p}`;
  }
  return p;
}

export async function fetchSameOrigin(path: string, init?: RequestInit, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS): Promise<Response> {
  const url = sameOriginUrl(path);
  try {
    return await fetchWithTimeout(url, init, timeoutMs);
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s (${path}).`);
    }
    throw e;
  }
}

/** Fetch dashboard APIs with retries (npm cold start / Windows / long backtest blips). */
/** Parse JSON or throw a clear error when the server returned HTML/text (common while build is running). */
export async function readJsonResponse<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`Empty response from server (HTTP ${res.status}). Wait for npm window to show Ready, then refresh.`);
  }
  if (trimmed.startsWith("<")) {
    throw new Error(
      `Server returned a web page instead of JSON (HTTP ${res.status}). ` +
        `The dashboard may still be building — check the npm/cmd window for errors, then refresh.`,
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      `Unexpected token in server response (HTTP ${res.status}). ` +
        `Wait for the npm window to finish building (Ready), or run REBUILD-DASHBOARD.bat. Preview: ${trimmed.slice(0, 100)}`,
    );
  }
}

export async function apiFetch(
  path: string,
  init?: RequestInit,
  retries = 12,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const url = apiUrl(path);
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url, init, timeoutMs);
    } catch (e) {
      last = e;
      if (e instanceof Error && e.name === "TimeoutError") {
        last = new Error(`Request timed out (${path}). Check the server window or your home engine URL.`);
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
  throw last;
}

export async function pingDashboard(): Promise<boolean> {
  try {
    const res = await apiFetch("/api/ping", undefined, 3, PING_FETCH_TIMEOUT_MS);
    const body = await res.json();
    return body?.ok === true && body?.service === "aar-dashboard";
  } catch {
    return false;
  }
}

/** Fast ping to the page you opened (Vercel or local) — not the remote engine URL. */
export async function pingSameOrigin(): Promise<boolean> {
  try {
    const res = await fetchSameOrigin("/api/ping", undefined, PING_FETCH_TIMEOUT_MS);
    const body = await res.json();
    return body?.ok === true && body?.service === "aar-dashboard";
  } catch {
    return false;
  }
}

/** Forward-test only: Vercel UI may call home PC via NEXT_PUBLIC_AAR_API_URL. */
function shouldUseRemoteEngine(path: string): boolean {
  if (!remoteEngineBase()) return false;
  if (typeof window !== "undefined" && isLocalDashboard()) return false;
  const p = path.startsWith("/") ? path : `/${path}`;
  return p.startsWith("/api/forward-test");
}

/**
 * All dashboard UI fetches — always the server that served this page (fixes local hang when .env points at dead tunnel).
 * Remote engine URL is used only for /api/forward-test* from a hosted (non-localhost) tab.
 */
export async function dashboardClientFetch(
  path: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  if (shouldUseRemoteEngine(path)) {
    return apiFetch(path, init, 2, timeoutMs);
  }
  return fetchSameOrigin(path, init, timeoutMs);
}

/** @deprecated Use dashboardClientFetch */
export const apiFetchForPage = dashboardClientFetch;

export type FetchErrorContext = "default" | "backtest-poll";

export function formatFetchError(e: unknown, path: string, context: FetchErrorContext = "default"): string {
  const msg = e instanceof Error ? e.message : String(e);
  const origin = localOrigin();

  if (!isLocalDashboard() && !remoteEngineBase()) {
    return (
      `Could not reach ${path} at ${origin}.\n\n` +
      `If this is Vercel: set NEXT_PUBLIC_AAR_API_URL to your home tunnel URL (see docs/SETUP-OLD-PC-VERCEL-REMOTE-ACCESS.md).\n` +
      `Or open your home lab directly (Tailscale / Cloudflare URL).`
    );
  }

  if (context === "backtest-poll" || (context === "default" && path.includes("backtest"))) {
    if (isNetworkErrorMessage(msg)) {
      return (
        `Could not reach ${path} at ${origin} while waiting for results.\n\n` +
        `This often happens on **long backtests** (Windows closes idle connections or Next.js hiccups). ` +
        `It does **not** always mean the server is down.\n\n` +
        `Try this:\n` +
        `1. Check the **npm/cmd window** — if Python is still running, wait for it to finish\n` +
        `2. Open ${origin}/api/ping in a new tab — if JSON shows ok:true, refresh the lab and run again (cached data makes reruns faster)\n` +
        `3. If ping fails, restart: ${localStartInstructions(origin).split("\n").slice(1).join("\n")}\n\n` +
        `Click "Test connection" on this page after the npm window shows Ready.`
      );
    }
  }

  if (isNetworkErrorMessage(msg)) {
    return (
      `Could not reach ${path} at ${origin}.\n\n` +
      `The dashboard server is not responding on this port.\n\n` +
      `${localStartInstructions(origin)}\n\n` +
      `If ping works but backtest fails, click "Test connection" below.`
    );
  }
  return msg;
}
