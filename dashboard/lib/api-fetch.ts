/** Build same-origin API URL (avoids wrong host/port when page URL differs). */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${p}`;
  }
  return p;
}

export function localOrigin(): string {
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

/** Fetch dashboard APIs with retries (npm cold start / Windows / long backtest blips). */
export async function apiFetch(path: string, init?: RequestInit, retries = 12): Promise<Response> {
  const url = apiUrl(path);
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, { ...init, cache: "no-store" });
    } catch (e) {
      last = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
  throw last;
}

export async function pingDashboard(): Promise<boolean> {
  try {
    const res = await apiFetch("/api/ping", undefined, 4);
    const body = await res.json();
    return body?.ok === true && body?.service === "aar-dashboard";
  } catch {
    return false;
  }
}

export type FetchErrorContext = "default" | "backtest-poll";

export function formatFetchError(e: unknown, path: string, context: FetchErrorContext = "default"): string {
  const msg = e instanceof Error ? e.message : String(e);
  const origin = localOrigin();

  if (!isLocalDashboard()) {
    return (
      `This page is open at ${origin}, not on your PC's local server.\n\n` +
      `Backtests only work locally:\n` +
      `1. On your PC open PowerShell in the AAR-YA-PAAR folder\n` +
      `2. Run .\\START-HERE-43123.bat or .\\START-HERE.bat\n` +
      `3. Use that localhost URL in your browser (not Vercel / not a remote preview).`
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
