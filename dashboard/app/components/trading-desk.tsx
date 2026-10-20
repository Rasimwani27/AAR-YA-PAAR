"use client";

import { useState } from "react";

import { LivePositionsPanel } from "@/app/components/live-positions-panel";
import { MetricCard } from "@/app/components/metric-card";
import { StrategyStatusGrid } from "@/app/components/strategy-status-grid";
import { TradeHistoryPanel } from "@/app/components/trade-history-panel";
import type { ForwardState } from "@/lib/forward-state";
import { pct, priceUsd, usd } from "@/lib/format";

type Tab = "overview" | "positions" | "history";

export function TradingDesk({ state, jobStatus }: { state: ForwardState | null; jobStatus: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const stats = state?.stats;
  const positions = state?.positions ?? [];
  const history = state?.history ?? [];
  const exchange = state?.exchange_positions ?? [];

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "positions", label: `Positions (${positions.length})` },
    { id: "history", label: `History (${history.length})` },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-950/80 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
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
        </div>
      </div>

      {stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Total P&amp;L (paper)"
            value={usd(stats.total_pnl_usd)}
            sub={`Realized ${usd(stats.realized_pnl_usd)} · Open ${usd(stats.unrealized_pnl_usd)}`}
            tone={stats.total_pnl_usd > 0 ? "profit" : stats.total_pnl_usd < 0 ? "loss" : "neutral"}
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
            sub="One slot per strategy"
          />
          <MetricCard
            label="Today (realized)"
            value={usd(stats.today_realized_usd)}
            tone={stats.today_realized_usd > 0 ? "profit" : stats.today_realized_usd < 0 ? "loss" : "neutral"}
          />
        </div>
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
          <LivePositionsPanel paper={positions} exchange={exchange} markPrice={state?.mark_price} />
        </>
      ) : null}

      {tab === "positions" ? (
        <LivePositionsPanel paper={positions} exchange={exchange} markPrice={state?.mark_price} />
      ) : null}

      {tab === "history" ? <TradeHistoryPanel history={history} /> : null}
    </div>
  );
}
