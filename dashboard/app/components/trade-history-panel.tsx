"use client";

import { Fragment, useMemo, useState } from "react";

import { StrategyBadge } from "@/app/components/strategy-badge";
import { PnlCell } from "@/app/components/metric-card";
import type { ForwardClosedTrade } from "@/lib/forward-state";
import { priceUsd, usd } from "@/lib/format";

function exitLabel(r: ForwardClosedTrade["exit_reason"]) {
  if (r === "target") return "Target";
  if (r === "stop") return "Stop";
  if (r === "manual") return "Manual";
  return r;
}

export function TradeHistoryPanel({ history }: { history: ForwardClosedTrade[] }) {
  const [filter, setFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return history;
    return history.filter((t) => t.strategy_id === filter);
  }, [history, filter]);

  const strategies = useMemo(() => {
    const ids = new Set(history.map((t) => t.strategy_id));
    return [...ids];
  }, [history]);

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Trade history</h2>
          <p className="text-xs text-zinc-500">Closed paper trades with strategy, exit reason, and hold time</p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200"
        >
          <option value="all">All strategies</option>
          {strategies.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-zinc-500">No closed trades yet — history fills when stops or targets hit.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800/60 text-[10px] uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-2.5 font-medium">Closed</th>
                <th className="px-4 py-2.5 font-medium">Strategy</th>
                <th className="px-4 py-2.5 font-medium">Side</th>
                <th className="px-4 py-2.5 font-medium text-right">Entry → Exit</th>
                <th className="px-4 py-2.5 font-medium text-right">P&amp;L</th>
                <th className="px-4 py-2.5 font-medium">Exit</th>
                <th className="px-4 py-2.5 font-medium text-right">Hold</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {filtered.map((t) => {
                const open = expanded === t.id;
                return (
                  <Fragment key={t.id}>
                    <tr
                      className="cursor-pointer text-zinc-300 hover:bg-zinc-800/30"
                      onClick={() => setExpanded(open ? null : t.id)}
                    >
                      <td className="px-4 py-2.5 text-xs text-zinc-400">
                        {new Date(t.closed_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5">
                        <StrategyBadge id={t.strategy_id} />
                      </td>
                      <td className="px-4 py-2.5 capitalize text-zinc-400">{t.side}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-zinc-400">
                        {priceUsd(t.entry_price)} → {priceUsd(t.exit_price)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <PnlCell value={t.gross_pnl_usd} />
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={
                            t.exit_reason === "target"
                              ? "text-emerald-400"
                              : t.exit_reason === "stop"
                                ? "text-rose-400"
                                : "text-zinc-400"
                          }
                        >
                          {exitLabel(t.exit_reason)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">{t.hold_minutes}m</td>
                    </tr>
                    {open ? (
                      <tr className="bg-zinc-950/60">
                        <td colSpan={7} className="px-4 py-3 text-xs text-zinc-500">
                          <span className="text-zinc-400">Signal: </span>
                          {t.reason}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
