"use client";

import { useCallback, useEffect, useState } from "react";

import { ForwardTestPanel } from "@/app/components/forward-test-panel";
import { HostedNotice } from "@/app/components/hosted-notice";
import {
  fetchSameOrigin,
  formatFetchError,
  isLocalDashboard,
  pingSameOrigin,
  readJsonResponse,
  remoteEngineBase,
} from "@/lib/api-fetch";
import type { HealthResponse } from "@/lib/types";

export function DashboardShell() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState("");
  const [healthLoading, setHealthLoading] = useState(true);
  const [serverOnline, setServerOnline] = useState(true);
  const [warnRemoteEnv, setWarnRemoteEnv] = useState(false);
  const localOrigin =
    typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:43123";

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    const run = async () => {
      const pingOk = await pingSameOrigin();
      setServerOnline(pingOk);
      if (!pingOk) {
        setError(formatFetchError(new Error("fetch failed"), "/api/ping"));
        setHealth(null);
        return;
      }
      const res = await fetchSameOrigin("/api/health");
      const body = await readJsonResponse<HealthResponse>(res);
      setHealth(body);
      if (!body.ok && body.engineError && !body.hosted && body.mode !== "hosted") {
        setError(body.engineError);
      } else {
        setError("");
      }
    };
    try {
      await Promise.race([
        run(),
        new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error("Health check timed out (12s). Use Test dashboard connection below.")), 12_000);
        }),
      ]);
    } catch (e) {
      setServerOnline(false);
      setHealth((prev) => prev ?? { ok: false, mode: "local", forwardTest: false, hosted: false });
      setError(formatFetchError(e, "/api/health"));
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  useEffect(() => {
    setWarnRemoteEnv(isLocalDashboard() && Boolean(remoteEngineBase()));
  }, []);

  const execBlocked =
    !healthLoading && (health?.mode === "hosted" || health?.hosted === true || health?.disableExec === true);
  const tradingReady = !execBlocked && (health?.tradingOk === true || health?.ok === true);
  const forwardReady = !execBlocked && health?.forwardTest === true;
  const onLocalHost = typeof window !== "undefined" && isLocalDashboard();
  const homeEngine = remoteEngineBase();
  const statusLabel = healthLoading
    ? "Checking…"
    : execBlocked
      ? onLocalHost
        ? "Local — exec disabled"
        : "Online — API probe OK"
      : tradingReady
        ? forwardReady
          ? "Trading + forward test ready"
          : "Trading ready (forward test needs full engine)"
        : "Setup required";
  const statusClass = healthLoading
    ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
    : execBlocked
      ? "bg-sky-500/15 text-sky-300 ring-sky-500/30"
      : tradingReady
        ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30"
        : "bg-amber-500/15 text-amber-300 ring-amber-500/30";

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#1a1f2e_0%,_#09090b_55%)] text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-500/90">AAR-YA-PAAR</p>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Bybit demo forward test</h1>
            <p className="text-sm text-zinc-500">
              Hyro path · live positions · trade history · multi-strategy signals
              {homeEngine ? (
                <span className="block text-xs text-sky-400/90">Engine: {homeEngine}</span>
              ) : null}
            </p>
          </div>
          <div className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${statusClass}`}>{statusLabel}</div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        {execBlocked ? <HostedNotice /> : (
          <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-400">
            Backtests are not run in this UI — use Python on your machine (
            <code className="text-zinc-300">python3 -m aar backtest</code>). This dashboard is for{" "}
            <strong className="text-zinc-200">forward testing</strong> on Bybit demo (default); Binance testnet remains optional in the panel below.
          </div>
        )}

        {!serverOnline && !execBlocked ? (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            Start <code className="text-rose-200">START-HERE-43123.bat</code>, then open{" "}
            <a className="text-amber-300 underline" href={`${localOrigin}/api/ping`}>
              {localOrigin}/api/ping
            </a>
            .
          </div>
        ) : null}

        {!healthLoading && !tradingReady && health && !execBlocked ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p className="font-medium">Fix local setup</p>
            <p className="mt-1 text-xs">{health.tradingError ?? health.engineError ?? "Repo root not found."}</p>
            <button
              type="button"
              onClick={() => void loadHealth()}
              className="mt-3 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs"
            >
              Re-check
            </button>
          </div>
        ) : null}

        {error && !execBlocked ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 whitespace-pre-wrap">
            {error}
          </div>
        ) : null}

        {warnRemoteEnv ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <code className="text-amber-200">NEXT_PUBLIC_AAR_API_URL</code> is set in{" "}
            <code className="text-amber-200">dashboard\.env.local</code> — delete that file or remove the line for normal
            local use; forward-test was trying a remote URL and could freeze the UI.
          </div>
        ) : null}

        <ForwardTestPanel
          canRun={forwardReady}
          tradingReady={tradingReady}
          execBlocked={execBlocked}
          healthLoading={healthLoading}
        />
      </main>
    </div>
  );
}
