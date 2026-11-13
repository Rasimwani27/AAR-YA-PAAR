"use client";

import { useCallback, useEffect, useState } from "react";

import { TradingDesk } from "@/app/components/trading-desk";
import { FORWARD_STRATEGIES, type ForwardStrategyId } from "@/lib/forward-config";
import {
  dashboardClientFetch,
  formatFetchError,
  isLocalDashboard,
  pingSameOrigin,
  readJsonResponse,
} from "@/lib/api-fetch";
import { LAB_BUILD } from "@/lib/lab-version";
import type { ForwardState } from "@/lib/forward-state";
import { mergeForwardState } from "@/lib/forward-merge";

type ProbeResult = {
  ok?: boolean;
  testnet?: boolean;
  canTrade?: boolean;
  totalWalletBalance?: string;
  availableBalance?: string;
};

type DeskTab = "overview" | "manual" | "positions" | "history" | "charts";

export function ForwardTestPanel({
  canRun,
  tradingReady,
  execBlocked,
  healthLoading,
}: {
  canRun: boolean;
  tradingReady: boolean;
  execBlocked: boolean;
  healthLoading: boolean;
}) {
  const [forwardExchange, setForwardExchange] = useState<"binance" | "bybit">("bybit");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [selected, setSelected] = useState<ForwardStrategyId[]>(["fade-reversal", "london-mid-engulf"]);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [probeError, setProbeError] = useState("");
  const [probeLoading, setProbeLoading] = useState(false);
  const [jobStatus, setJobStatus] = useState<string>("");
  const [jobError, setJobError] = useState<string>("");
  const [forwardState, setForwardState] = useState<ForwardState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastClick, setLastClick] = useState("");
  const [connStatus, setConnStatus] = useState<string>("disconnected");
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [hasSavedCreds, setHasSavedCreds] = useState(false);
  const [deskTab, setDeskTab] = useState<DeskTab>("overview");

  const buttonsDisabled = probeLoading;

  const patchForwardState = useCallback((patch: Partial<ForwardState> | ForwardState) => {
    setForwardState((prev) => mergeForwardState(prev, patch));
  }, []);

  const loadConnectionMeta = useCallback(async () => {
    try {
      const res = await dashboardClientFetch("/api/bybit/credentials?environment=demo");
      const body = await res.json();
      const meta = body.meta as { status?: string; maskedApiKey?: string | null; hasCredentials?: boolean };
      if (meta?.status) setConnStatus(meta.status);
      setMaskedKey(meta?.maskedApiKey ?? null);
      setHasSavedCreds(Boolean(meta?.hasCredentials));
      if (meta?.hasCredentials) {
        void dashboardClientFetch("/api/bybit/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "test", environment: "demo" }),
        })
          .then((r) => r.json())
          .then((b) => {
            if (b.meta?.status) setConnStatus(b.meta.status);
          })
          .catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadConnectionMeta();
  }, [loadConnectionMeta]);

  useEffect(() => {
    if (!probeLoading) return;
    const timer = window.setTimeout(() => setProbeLoading(false), 22_000);
    return () => window.clearTimeout(timer);
  }, [probeLoading]);

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
      const pingOk = await pingSameOrigin();
      if (!pingOk) {
        setProbeError("Dashboard API offline. Run START-HERE-43123.bat from the repo folder and keep that window open.");
        return;
      }
      const res = await dashboardClientFetch("/api/health");
      const body = await readJsonResponse<Record<string, unknown>>(res);
      if (body.hosted || body.disableExec) {
        setStatusMsg(
          `Dashboard online (${LAB_BUILD}) · Bybit/Binance API test works here when exposed. Python forward test: run START-HERE-43123.bat on your PC.`,
        );
        return;
      }
      if (body.engineError) {
        setProbeError(String(body.engineError));
        return;
      }
      setStatusMsg(`Engine OK · repo: ${body.repoRoot ?? "?"} · forward test: ${String(body.forwardTest)}`);
    } catch (e) {
      setProbeError(formatFetchError(e, "/api/health"));
    } finally {
      setProbeLoading(false);
    }
  }, []);

  const refreshLiveOnline = useCallback(async () => {
    if (deskTab === "manual") return;
    const path = "/api/bybit/sync";
    try {
      const res = await dashboardClientFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environment: "demo",
          apiKey: apiKey.trim() || undefined,
          apiSecret: apiSecret.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (body.ok && (body.state || body.exchange_positions)) {
        const st = (body.state ?? body) as ForwardState;
        patchForwardState({
          ...st,
          ok: true,
          exchange: "bybit",
          bybit_environment: "demo",
          exchange_positions: st.exchange_positions ?? body.exchange_positions,
          exchange_stats: st.exchange_stats ?? body.exchange_stats,
          bybit_open_orders: st.bybit_open_orders ?? body.bybit_open_orders,
          bybit_wallet: st.bybit_wallet ?? body.bybit_wallet,
          probe: st.probe ?? body.probe,
          updated_at: st.updated_at ?? body.updated_at ?? new Date().toISOString(),
        });
      }
    } catch {
      /* ignore */
    }
  }, [apiKey, apiSecret, deskTab, patchForwardState]);

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
    setProbeLoading(true);
    try {
      const res = await dashboardClientFetch("/api/binance/test", {
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
      setStatusMsg(
        body.mode === "online"
          ? "Binance testnet OK (online server — keys not saved). Start/Stop forward test still needs local 43123."
          : "Binance testnet connection successful.",
      );
      if (body.mode === "online") await refreshLiveOnline();
    } catch (e) {
      setProbeError(formatFetchError(e, "/api/binance/test"));
    } finally {
      setProbeLoading(false);
    }
  }, [apiKey, apiSecret, refreshLiveOnline]);

  const testBybit = useCallback(async () => {
    setLastClick("bybit");
    setProbeError("");
    setStatusMsg("");
    setProbe(null);
    const key = apiKey.trim();
    const secret = apiSecret.trim();
    if (!key || !secret) {
      setProbeError("Enter both API key and secret first.");
      return;
    }
    setProbeLoading(true);
    try {
      const res = await dashboardClientFetch(
        "/api/bybit/test",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: key, apiSecret: secret, environment: "demo" }),
        },
        20_000,
      );
      const body = await res.json();
      if (!body.ok) {
        setProbeError(typeof body.error === "string" ? body.error : JSON.stringify(body.error));
        return;
      }
      setProbe(body.data as ProbeResult);
      setConnStatus("connected");
      setStatusMsg(
        "Bybit Demo Trading API OK. Forward test places demo orders on signals (no simulation).",
      );
      await refreshLiveOnline();
    } catch (e) {
      setProbeError(formatFetchError(e, "/api/bybit/test"));
    } finally {
      setProbeLoading(false);
    }
  }, [apiKey, apiSecret, refreshLiveOnline]);

  const refreshState = useCallback(async () => {
    try {
      const res = await dashboardClientFetch("/api/forward-test");
      const body = await res.json();
      if (body.job?.status) setJobStatus(body.job.status);
      if (body.job?.error) setJobError(String(body.job.error));
      else if (body.job?.status !== "error") setJobError("");
      if (body.state) {
        setForwardState(body.state as ForwardState);
        const st = body.state as ForwardState & { error?: string };
        if (st.error && body.job?.status === "error") setJobError(st.error);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const fast = jobStatus === "running";
    const ms = fast ? 4_000 : execBlocked ? 20_000 : 8_000;
    let n = 0;
    const tick = () => {
      if (execBlocked) {
        void refreshLiveOnline();
        return;
      }
      void refreshState();
      n += 1;
      if (apiKey.trim() && apiSecret.trim() && (fast || n % 2 === 0)) {
        void refreshLiveOnline();
      }
    };
    const t = setInterval(tick, ms);
    tick();
    return () => clearInterval(t);
  }, [execBlocked, refreshState, refreshLiveOnline, jobStatus, apiKey, apiSecret]);

  async function startForward() {
    setError("");
    setBusy(true);
    try {
      const res = await dashboardClientFetch("/api/forward-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          forwardExchange,
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
      setJobError("");
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
      await dashboardClientFetch("/api/forward-test", {
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
      const res = await dashboardClientFetch("/api/forward-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "tick",
          forwardExchange,
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
        <p className="text-sm text-zinc-400">
          Checking engine… test buttons below still work (or wait up to 12s for the status pill).
        </p>
      ) : null}
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 shadow-xl ring-1 ring-white/5">
        <h2 className="text-sm font-semibold text-zinc-200">Connection &amp; credentials</h2>
        <p className="text-[10px] text-zinc-600">Build {LAB_BUILD}</p>
        <p className="mt-2 text-sm font-medium text-sky-200">Strategy Forward Testing · Bybit Demo Trading</p>
        <p className="mt-1 text-sm text-zinc-500">
          API keys are encrypted and stored on this PC only (<code className="text-zinc-400">out/forward/bybit-credentials-demo.enc</code>). Secret is never kept in the browser.
          Create keys in{" "}
          <a className="text-amber-400 underline" href="https://www.bybit.com/" target="_blank" rel="noreferrer">
            Bybit
          </a>{" "}
          → <strong className="text-zinc-300">Demo Trading</strong> → API ({' '}
          <a
            className="text-amber-400 underline"
            href="https://bybit-exchange.github.io/docs/v5/demo"
            target="_blank"
            rel="noreferrer"
          >
            docs
          </a>
          ). Mainnet keys for live manual trading are saved separately on the Manual Trade tab.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ${
              connStatus === "connected"
                ? "bg-emerald-500/20 text-emerald-300"
                : connStatus === "auth_failed"
                  ? "bg-rose-500/20 text-rose-300"
                  : connStatus === "connection_error"
                    ? "bg-amber-500/20 text-amber-200"
                    : "bg-zinc-800 text-zinc-400"
            }`}
          >
            {connStatus === "connected"
              ? "Connected · Bybit demo"
              : connStatus === "auth_failed"
                ? "Authentication failed"
                : connStatus === "connection_error"
                  ? "Connection error"
                  : hasSavedCreds
                    ? "Saved credentials (not verified)"
                    : "Disconnected"}
          </span>
          {maskedKey ? <span className="text-zinc-500">Key {maskedKey} · Secret ********</span> : null}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-zinc-400">
            API key
            <input
              type="text"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                forwardExchange === "bybit" && hasSavedCreds
                  ? maskedKey ?? "Saved key"
                  : forwardExchange === "bybit"
                    ? "Bybit demo API key"
                    : "Binance testnet API key"
              }
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
              placeholder={hasSavedCreds && forwardExchange === "bybit" ? "******** (saved — enter to replace)" : "Secret"}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={buttonsDisabled}
              className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-40"
              onClick={async () => {
                setProbeError("");
                try {
                  const res = await dashboardClientFetch("/api/bybit/credentials", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "save",
                      environment: "demo",
                      apiKey: apiKey.trim(),
                      apiSecret: apiSecret.trim(),
                    }),
                  });
                  const body = await res.json();
                  if (!body.ok) {
                    setProbeError(body.error ?? "Save failed");
                    await loadConnectionMeta();
                    return;
                  }
                  setConnStatus(body.meta?.status ?? "connected");
                  setMaskedKey(body.meta?.maskedApiKey ?? null);
                  setHasSavedCreds(true);
                  setApiSecret("");
                  setStatusMsg("Credentials saved and verified on Bybit demo.");
                  await refreshLiveOnline();
                  await loadConnectionMeta();
                } catch (e) {
                  setProbeError(formatFetchError(e, "/api/bybit/credentials"));
                }
              }}
            >
              Save &amp; verify connection
            </button>
            <button
              type="button"
              className="rounded-lg border border-zinc-600 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
              onClick={async () => {
                await dashboardClientFetch("/api/bybit/credentials", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "disconnect", environment: "demo" }),
                });
                setConnStatus("disconnected");
                setMaskedKey(null);
                setHasSavedCreds(false);
                setApiKey("");
                setApiSecret("");
              }}
            >
              Disconnect
            </button>
            <button
              type="button"
              disabled={!hasSavedCreds || buttonsDisabled}
              className="rounded-lg border border-amber-600/50 px-3 py-2 text-xs text-amber-200 hover:bg-amber-500/10 disabled:opacity-40"
              onClick={async () => {
                try {
                  const res = await dashboardClientFetch("/api/bybit/reconcile", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ environment: "demo" }),
                  });
                  const body = await res.json();
                  if (body.state) patchForwardState(body.state as ForwardState);
                  setStatusMsg(body.ok ? "Trade history reconciled with Bybit closed P&L." : body.error);
                } catch (e) {
                  setProbeError(formatFetchError(e, "/api/bybit/reconcile"));
                }
              }}
            >
              Reconcile P&amp;L history
            </button>
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
            disabled={buttonsDisabled || forwardExchange !== "binance"}
            onClick={(e) => {
              e.preventDefault();
              void testConnection();
            }}
            className="relative z-20 cursor-pointer rounded-lg border-2 border-amber-500 bg-amber-600 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {probeLoading && lastClick === "binance" ? "Testing…" : "2. Test Binance testnet API"}
          </button>
          <button
            type="button"
            disabled={buttonsDisabled}
            onClick={(e) => {
              e.preventDefault();
              void testBybit();
            }}
            className="relative z-20 cursor-pointer rounded-lg border-2 border-sky-500 bg-sky-600 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {probeLoading && lastClick === "bybit" ? "Testing…" : "2. Test Bybit demo API"}
          </button>
          <button
            type="button"
            disabled={buttonsDisabled || !hasSavedCreds}
            onClick={async () => {
              try {
                const res = await dashboardClientFetch("/api/bybit/credentials", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "test", environment: "demo" }),
                });
                const body = await res.json();
                setConnStatus(body.meta?.status ?? (body.ok ? "connected" : "auth_failed"));
                setStatusMsg(body.ok ? "Saved Demo credentials verified on Bybit." : body.error ?? "Test failed");
              } catch (e) {
                setProbeError(formatFetchError(e, "/api/bybit/credentials"));
              }
            }}
            className="rounded-lg border border-sky-500/50 px-4 py-2.5 text-sm text-sky-200 hover:bg-sky-500/10 disabled:opacity-40"
          >
            Test saved Demo connection
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
        {probe?.availableBalance !== undefined && probe?.availableBalance !== null ? (
          <p className="mt-3 text-sm text-emerald-200">
            {probe.totalWalletBalance != null ? `Wallet ${probe.totalWalletBalance} USDT · ` : null}
            available {probe.availableBalance} USDT
            {probe.canTrade !== undefined ? ` · canTrade ${String(probe.canTrade)}` : null}
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
        {jobStatus ? (
          <p className="mt-2 text-xs text-zinc-500">
            Job: {jobStatus}
            {jobError ? <span className="mt-1 block text-rose-400/90">{jobError}</span> : null}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-700/60 bg-gradient-to-b from-zinc-900/80 to-zinc-950/90 p-5 shadow-2xl ring-1 ring-amber-500/10">
        <h2 className="text-base font-semibold text-zinc-100">Trading desk</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Strategy forward testing on Bybit Demo only — positions, orders, and P&amp;L come from the exchange API.
        </p>
        <div className="mt-5">
          <TradingDesk
            state={forwardState}
            jobStatus={jobStatus}
            onState={patchForwardState}
            onTabChange={setDeskTab}
            manualDisabled={execBlocked || !tradingReady}
            apiKey={apiKey}
            apiSecret={apiSecret}
          />
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
