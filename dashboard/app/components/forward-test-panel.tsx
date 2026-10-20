"use client";

import { useCallback, useEffect, useState } from "react";

import { TradingDesk } from "@/app/components/trading-desk";
import { FORWARD_STRATEGIES, type ForwardStrategyId } from "@/lib/forward-config";
import { apiFetch, formatFetchError, pingDashboard } from "@/lib/api-fetch";
import type { ForwardState } from "@/lib/forward-state";

type ProbeResult = {
  ok?: boolean;
  testnet?: boolean;
  canTrade?: boolean;
  totalWalletBalance?: string;
  availableBalance?: string;
};

export function ForwardTestPanel({
  canRun,
  execBlocked,
  healthLoading,
}: {
  canRun: boolean;
  execBlocked: boolean;
  healthLoading: boolean;
}) {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [selected, setSelected] = useState<ForwardStrategyId[]>(["fade-reversal", "london-mid-engulf"]);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [probeError, setProbeError] = useState("");
  const [probeLoading, setProbeLoading] = useState(false);
  const [jobStatus, setJobStatus] = useState<string>("");
  const [forwardState, setForwardState] = useState<ForwardState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastClick, setLastClick] = useState("");

  const buttonsDisabled = probeLoading;

  const toggleStrategy = (id: ForwardStrategyId) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const testDashboardOnly = useCallback(async () => {
    setLastClick("dashboard");
    setProbeError("");
    setStatusMsg("");
    setProbe(null);
    setProbeLoading(true);
    try {
      const pingOk = await pingDashboard();
      if (!pingOk) {
        setProbeError("Dashboard API offline. Run START-HERE-43123.bat from the repo folder and keep that window open.");
        return;
      }
      const res = await apiFetch("/api/health");
      const body = await res.json();
      if (body.hosted || body.disableExec) {
        setProbeError(
          "Forward test engine is off on this server. On your PC run START-HERE-43123.bat and open http://127.0.0.1:43123 — not the Vercel URL.",
        );
        return;
      }
      if (body.engineError) {
        setProbeError(body.engineError);
        return;
      }
      setStatusMsg(`Engine OK · repo: ${body.repoRoot ?? "?"} · forward test: ${String(body.forwardTest)}`);
    } catch (e) {
      setProbeError(formatFetchError(e, "/api/health"));
    } finally {
      setProbeLoading(false);
    }
  }, []);

  const testConnection = useCallback(async () => {
    setLastClick("binance");
    setProbeError("");
    setStatusMsg("");
    setProbe(null);
    const key = apiKey.trim();
    const secret = apiSecret.trim();
    if (!key || !secret) {
      setProbeError("Enter both API key and secret first.");
      return;
    }
    if (execBlocked) {
      setProbeError(
        "Binance test runs on your PC only. Run START-HERE-43123.bat, open http://127.0.0.1:43123, then test again.",
      );
      return;
    }
    setProbeLoading(true);
    try {
      const res = await apiFetch("/api/forward-test/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key, apiSecret: secret }),
      });
      const body = await res.json();
      if (!body.ok) {
        setProbeError(typeof body.error === "string" ? body.error : JSON.stringify(body.error));
        return;
      }
      setProbe(body.data as ProbeResult);
      setStatusMsg("Binance testnet connection successful.");
    } catch (e) {
      setProbeError(formatFetchError(e, "/api/forward-test/test"));
    } finally {
      setProbeLoading(false);
    }
  }, [apiKey, apiSecret, execBlocked]);

  const refreshState = useCallback(async () => {
    try {
      const res = await apiFetch("/api/forward-test");
      const body = await res.json();
      if (body.job?.status) setJobStatus(body.job.status);
      if (body.state) setForwardState(body.state as ForwardState);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (execBlocked) return;
    const fast = jobStatus === "running";
    const ms = fast ? 5_000 : 12_000;
    const t = setInterval(() => void refreshState(), ms);
    void refreshState();
    return () => clearInterval(t);
  }, [execBlocked, refreshState, jobStatus]);

  async function startForward() {
    setError("");
    setBusy(true);
    try {
      const res = await apiFetch("/api/forward-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          apiKey: apiKey.trim(),
          apiSecret: apiSecret.trim(),
          strategies: selected,
        }),
      });
      const body = await res.json();
      if (!body.ok) {
        setError(body.error ?? "Start failed");
        return;
      }
      setJobStatus(body.job?.status ?? "running");
      await refreshState();
    } catch (e) {
      setError(formatFetchError(e, "/api/forward-test"));
    } finally {
      setBusy(false);
    }
  }

  async function stopForward() {
    setBusy(true);
    try {
      await apiFetch("/api/forward-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      setJobStatus("stopped");
    } finally {
      setBusy(false);
    }
  }

  async function runSingleTick() {
    setError("");
    setBusy(true);
    try {
      const res = await apiFetch("/api/forward-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "tick",
          apiKey: apiKey.trim(),
          apiSecret: apiSecret.trim(),
          strategies: selected,
        }),
      });
      const body = await res.json();
      if (!body.ok) {
        setError(body.error ?? "Tick failed");
        return;
      }
      setForwardState(body.data as ForwardState);
    } catch (e) {
      setError(formatFetchError(e, "/api/forward-test"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative z-10 space-y-8" style={{ pointerEvents: "auto" }}>
      {healthLoading ? (
        <p className="text-sm text-zinc-400">Checking engine… buttons unlock when ready.</p>
      ) : null}
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 shadow-xl ring-1 ring-white/5">
        <h2 className="text-sm font-semibold text-zinc-200">Connection &amp; credentials</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Keys are sent only to your local Python process (not saved). Get keys from{" "}
          <a className="text-amber-400 underline" href="https://testnet.binancefuture.com/" target="_blank" rel="noreferrer">
            testnet.binancefuture.com
          </a>
          .
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-zinc-400">
            API key
            <input
              type="text"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste testnet API key"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Secret key
            <input
              type="password"
              autoComplete="new-password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="Paste testnet secret"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={buttonsDisabled}
            onClick={(e) => {
              e.preventDefault();
              void testDashboardOnly();
            }}
            className="relative z-20 cursor-pointer rounded-lg border-2 border-zinc-500 bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {probeLoading && lastClick === "dashboard" ? "Testing…" : "1. Test dashboard connection"}
          </button>
          <button
            type="button"
            disabled={buttonsDisabled}
            onClick={(e) => {
              e.preventDefault();
              void testConnection();
            }}
            className="relative z-20 cursor-pointer rounded-lg border-2 border-amber-500 bg-amber-600 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {probeLoading && lastClick === "binance" ? "Testing…" : "2. Test Binance testnet API"}
          </button>
          <a
            href="/api/ping"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-lg border border-zinc-600 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Open /api/ping
          </a>
        </div>

        {statusMsg ? (
          <p className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
            {statusMsg}
          </p>
        ) : null}
        {probeError ? (
          <p className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100 whitespace-pre-wrap">
            {probeError}
          </p>
        ) : null}
        {probe?.totalWalletBalance !== undefined && probe.availableBalance !== undefined ? (
          <p className="mt-3 text-sm text-emerald-200">
            Wallet {probe.totalWalletBalance} USDT · available {probe.availableBalance} · canTrade {String(probe.canTrade)}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 ring-1 ring-white/5">
        <h2 className="text-sm font-semibold text-zinc-200">Strategies &amp; engine</h2>
        <div className="mt-4 space-y-2">
          {FORWARD_STRATEGIES.map((s) => (
            <label
              key={s.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-700/80 bg-zinc-950/50 p-3"
            >
              <input
                type="checkbox"
                checked={selected.includes(s.id)}
                onChange={() => toggleStrategy(s.id)}
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="font-medium text-zinc-100">{s.label}</span>
                <span className="block text-xs text-zinc-500">{s.description}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canRun || busy || execBlocked || selected.length === 0}
            onClick={() => void startForward()}
            className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            Start forward test
          </button>
          <button
            type="button"
            disabled={busy || execBlocked}
            onClick={() => void stopForward()}
            className="cursor-pointer rounded-lg border border-zinc-600 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-40"
          >
            Stop
          </button>
          <button
            type="button"
            disabled={!canRun || busy || execBlocked}
            onClick={() => void runSingleTick()}
            className="cursor-pointer rounded-lg border border-amber-600/50 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/10 disabled:opacity-40"
          >
            Run one tick
          </button>
        </div>
        {jobStatus ? <p className="mt-2 text-xs text-zinc-500">Job: {jobStatus}</p> : null}
      </section>

      <section className="rounded-2xl border border-zinc-700/60 bg-gradient-to-b from-zinc-900/80 to-zinc-950/90 p-5 shadow-2xl ring-1 ring-amber-500/10">
        <h2 className="text-base font-semibold text-zinc-100">Trading desk</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Live paper positions, exchange sync, signals, and closed-trade history (updates every 5s while forward test runs).
        </p>
        <div className="mt-5">
          <TradingDesk state={forwardState} jobStatus={jobStatus} />
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 whitespace-pre-wrap">
          {error}
        </div>
      ) : null}
    </div>
  );
}
