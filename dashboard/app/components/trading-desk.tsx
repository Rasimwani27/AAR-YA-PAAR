"use client";

import { useCallback, useEffect, useState } from "react";

import { useBybitStream } from "@/app/components/use-bybit-stream";
import { useBybitSync } from "@/app/components/use-bybit-sync";
import type { BybitEnvironment } from "@/lib/bybit-environment";

import { LivePositionsPanel } from "@/app/components/live-positions-panel";
import { ManualTradePanel } from "@/app/components/manual-trade-panel";
import { SessionTimerPanel } from "@/app/components/session-timer-panel";
import { MetricCard } from "@/app/components/metric-card";
import { StrategyStatusGrid } from "@/app/components/strategy-status-grid";
import { TradeHistoryPanel } from "@/app/components/trade-history-panel";
import { TradingViewPanel } from "@/app/components/tradingview-panel";
import { dashboardClientFetch, formatFetchError, readJsonResponse } from "@/lib/api-fetch";
import type { ForwardExchangePosition, ForwardState } from "@/lib/forward-state";
import { LAB_BUILD } from "@/lib/lab-version";
import { pct, priceUsd, usd, usdPnl } from "@/lib/format";
import { mergeForwardState } from "@/lib/forward-merge";
import { resolveForwardStats, sumExchangeUnrealized } from "@/lib/forward-stats";

type DeskTab = "overview" | "manual" | "positions" | "history" | "charts";
type Tab = DeskTab;

export function TradingDesk({
  state,
  jobStatus,
  onState,
  onTabChange,
  manualDisabled,
  apiKey,
  apiSecret,
}: {
  state: ForwardState | null;
  jobStatus: string;
  onState?: (patch: Partial<ForwardState> | ForwardState) => void;
  onTabChange?: (tab: DeskTab) => void;
  manualDisabled?: boolean;
  apiKey?: string;
  apiSecret?: string;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [focusManualId, setFocusManualId] = useState<string | null>(null);
  const stats = resolveForwardStats(state);
  const history = state?.history ?? [];
  const exchange = state?.exchange_positions ?? [];
  const exchangeUpnl =
    state?.exchange_stats?.unrealized_usd ?? sumExchangeUnrealized(exchange);
  const [activeEnv, setActiveEnv] = useState<BybitEnvironment>(state?.bybit_environment ?? "demo");
  const env = activeEnv;
  const totalPnl = stats?.total_pnl_usd ?? exchangeUpnl;
  const [tradeError, setTradeError] = useState("");

  useEffect(() => {
    const next: BybitEnvironment = tab === "manual" ? "mainnet" : "demo";
    setActiveEnv(next);
    onTabChange?.(tab);
  }, [tab, onTabChange]);

  const patchState = useCallback(
    (patch: Partial<ForwardState>) => {
      if (!onState) return;
      onState(mergeForwardState(state, patch));
    },
    [onState, state],
  );

  const applyFullState = useCallback(
    (incoming: ForwardState) => {
      if (!onState) return;
      onState(mergeForwardState(state, incoming));
    },
    [onState, state],
  );

  useBybitStream({
    enabled: Boolean(onState && !manualDisabled),
    environment: env,
    onStatePatch: patchState,
  });

  useBybitSync({
    enabled: Boolean(onState && !manualDisabled),
    environment: env,
    intervalMs: tab === "manual" ? 6_000 : 10_000,
    onState: applyFullState,
  });

  const closeExchange = async (e: ForwardExchangePosition) => {
    if (!onState || !e.symbol || !e.side) return;
    setTradeError("");
    try {
      const res = await dashboardClientFetch("/api/manual-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "close_exchange",
          symbol: e.symbol,
          side: e.side,
          mark_price: state?.mark_price,
          apiKey: apiKey?.trim() || undefined,
          apiSecret: apiSecret?.trim() || undefined,
          bybit_environment: env,
        }),
      });
      const body = await readJsonResponse<{ ok?: boolean; error?: string; state?: ForwardState }>(res);
      if (!body.ok) {
        setTradeError(body.error ?? "Exchange close failed");
        return;
      }
      if (body.state) applyFullState(body.state);
    } catch (err) {
      setTradeError(formatFetchError(err, "/api/manual-trade"));
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "manual", label: "Manual trade" },
    { id: "positions", label: `Positions (${exchange.filter((e) => !e.error && e.qty).length})` },
    { id: "history", label: `History (${history.length})` },
    { id: "charts", label: "Charts · TV" },
  ];

  return (
    <div className="space-y-5">
      <SessionTimerPanel disabled={manualDisabled} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-950/80 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                onTabChange?.(t.id);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          {state?.exchange ? (
            <span className="rounded-full bg-sky-500/15 px-2 py-0.5 font-medium text-sky-300">
              {env === "mainnet" ? "Live · Bybit Mainnet" : "Forward · Bybit Demo"}
            </span>
          ) : null}
          {state?.updated_at ? (
            <span>Updated {new Date(state.updated_at).toLocaleTimeString()}</span>
          ) : null}
          {jobStatus ? (
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 capitalize text-zinc-400">Job {jobStatus}</span>
          ) : null}
          {state?.mark_price ? (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-200">
              BTC {priceUsd(state.mark_price)}
            </span>
          ) : null}
          <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-violet-200" title="If this does not match, you are on an old folder or zip">
            Build {LAB_BUILD}
          </span>
        </div>
      </div>

      {tradeError ? (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{tradeError}</p>
      ) : null}

      {stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <MetricCard
            label="Total P&amp;L"
            value={usdPnl(totalPnl)}
            sub={`Realized ${usdPnl(stats.realized_pnl_usd)} · Unrealized ${usdPnl(stats.unrealized_pnl_usd)}`}
            tone={totalPnl > 0 ? "profit" : totalPnl < 0 ? "loss" : "neutral"}
          />
          <MetricCard
            label="Unrealized (open)"
            value={usdPnl(exchangeUpnl)}
            sub={exchange.length ? `${exchange.length} position(s) on Bybit` : "No open positions"}
            tone={exchangeUpnl > 0 ? "profit" : exchangeUpnl < 0 ? "loss" : "neutral"}
          />
          <MetricCard
            label="Win rate"
            value={pct(stats.win_rate_pct, 1)}
            sub={`${stats.wins}W / ${stats.losses}L · ${stats.closed_trades} closed`}
            tone={stats.win_rate_pct >= 50 ? "profit" : "neutral"}
          />
          <MetricCard
            label="Open positions"
            value={String(stats.open_count)}
            sub="On Bybit"
          />
          <MetricCard
            label="Today (realized, net)"
            value={usdPnl(stats.today_realized_usd)}
            sub="From trade history (Bybit net when synced)"
            tone={stats.today_realized_usd > 0 ? "profit" : stats.today_realized_usd < 0 ? "loss" : "neutral"}
          />
        </div>
      ) : null}
      {state?.bybit_errors?.length ? (
        <p className="text-xs text-amber-400/90" role="status">
          Bybit order notes: {state.bybit_errors.slice(-3).join(" · ")}
        </p>
      ) : null}

      {tab === "overview" ? (
        <>
          <StrategyStatusGrid results={state?.results ?? []} markPrice={state?.mark_price} />
          {stats?.by_strategy?.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {stats.by_strategy.map((s) => (
                <div
                  key={s.strategy_id}
                  className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2 text-sm"
                >
                  <span className="text-zinc-400">{s.strategy_name}</span>
                  <span className="tabular-nums text-zinc-200">
                    {s.trades} trades · {usd(s.net_usd)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          <LivePositionsPanel
            exchange={exchange}
            markPrice={state?.mark_price}
            bybitEnvironment={env}
            onCloseExchange={(e) => void closeExchange(e)}
          />
        </>
      ) : null}

      {tab === "manual" ? (
        <ManualTradePanel
          state={state}
          disabled={manualDisabled}
          focusPositionId={focusManualId}
          apiKey={apiKey}
          apiSecret={apiSecret}
          onState={(s) => {
            applyFullState(s);
            setFocusManualId(null);
          }}
        />
      ) : null}

      {tab === "positions" ? (
        <LivePositionsPanel
          exchange={exchange}
          markPrice={state?.mark_price}
          bybitEnvironment={env}
          onCloseExchange={(e) => void closeExchange(e)}
        />
      ) : null}

      {tab === "history" ? <TradeHistoryPanel history={history} /> : null}

      {tab === "charts" ? <TradingViewPanel history={history} positions={[]} /> : null}
    </div>
  );
}
