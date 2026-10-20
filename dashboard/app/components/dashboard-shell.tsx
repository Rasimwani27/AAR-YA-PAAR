"use client";

import { useCallback, useEffect, useState } from "react";

import { ForwardTestPanel } from "@/app/components/forward-test-panel";
import { HostedNotice } from "@/app/components/hosted-notice";
import { apiFetch, formatFetchError, isLocalDashboard, pingDashboard } from "@/lib/api-fetch";
import type { HealthResponse } from "@/lib/types";

export function DashboardShell() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState("");
  const [healthLoading, setHealthLoading] = useState(true);
  const [serverOnline, setServerOnline] = useState(true);
  const localOrigin =
    typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:43123";

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const pingOk = await pingDashboard();
      setServerOnline(pingOk);
      if (!pingOk) {
        setError(formatFetchError(new Error("fetch failed"), "/api/ping"));
        setHealth(null);
        return;
      }
      const res = await apiFetch("/api/health");
      const body = (await res.json()) as HealthResponse;
      setHealth(body);
      if (!body.ok && body.engineError) {
        setError(body.engineError);
      } else {
        setError("");
      }
    } catch (e) {
      setServerOnline(false);
      setHealth(null);
      setError(formatFetchError(e, "/api/health"));
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  const execBlocked =
    !healthLoading && (health?.mode === "hosted" || health?.hosted === true || health?.disableExec === true);
  const forwardReady = !execBlocked && (health?.forwardTest === true || health?.ok === true);
  const onLocalHost = typeof window !== "undefined" && isLocalDashboard();
  const statusLabel = healthLoading
    ? "Checking…"
    : execBlocked
      ? onLocalHost
        ? "Local — exec disabled"
        : "Public site (view only)"
      : forwardReady
        ? "Forward test ready"
        : "Setup required";
  const statusClass = healthLoading
    ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
    : execBlocked
      ? "bg-sky-500/15 text-sky-300 ring-sky-500/30"
      : forwardReady
        ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30"
        : "bg-amber-500/15 text-amber-300 ring-amber-500/30";

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#1a1f2e_0%,_#09090b_55%)] text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-500/90">AAR-YA-PAAR</p>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Forward test command center</h1>
            <p className="text-sm text-zinc-500">Live positions · trade history · multi-strategy signals</p>
          </div>
          <div className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${statusClass}`}>{statusLabel}</div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        {execBlocked ? <HostedNotice /> : (
          <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-400">
            Backtests are not run in this UI — use Python on your machine (
            <code className="text-zinc-300">python3 -m aar backtest</code>). This dashboard is for{" "}
            <strong className="text-zinc-200">forward testing</strong> on Binance testnet only.
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

        {!healthLoading && !forwardReady && health && !execBlocked ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p className="font-medium">Fix local setup</p>
            <p className="mt-1 text-xs">{health.engineError ?? "Engine files missing at repo root."}</p>
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

        <ForwardTestPanel canRun={forwardReady} execBlocked={execBlocked} healthLoading={healthLoading} />
      </main>
    </div>
  );
}
