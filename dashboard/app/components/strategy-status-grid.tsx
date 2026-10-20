"use client";

import { StrategyBadge } from "@/app/components/strategy-badge";
import type { ForwardStrategyResult } from "@/lib/forward-state";
import { priceUsd } from "@/lib/format";

export function StrategyStatusGrid({ results, markPrice }: { results: ForwardStrategyResult[]; markPrice?: number }) {
  if (!results?.length) {
    return (
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-4 py-6 text-center text-sm text-zinc-500">
        Run a tick or start forward test to see per-strategy signals.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {results.map((r) => {
        const sig = r.signal;
        const hasSignal = sig && sig.side;
        return (
          <div
            key={r.label}
            className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4 ring-1 ring-white/5"
          >
            <div className="flex items-center justify-between gap-2">
              <StrategyBadge id={r.label} />
              {hasSignal ? (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-400 ring-1 ring-emerald-500/30">
                  Signal
                </span>
              ) : (
                <span className="text-[10px] uppercase text-zinc-600">Flat</span>
              )}
            </div>
            <p className="mt-2 text-xs text-zinc-500">{r.strategy ?? r.label}</p>
            {r.error ? (
              <p className="mt-2 text-xs text-rose-400">{r.error}</p>
            ) : hasSignal ? (
              <div className="mt-3 space-y-1 text-sm">
                <p className="font-medium capitalize text-zinc-100">
                  {sig.side} @ {priceUsd(sig.entry_price)}
                </p>
                <p className="text-xs text-zinc-500">
                  SL ${sig.stop_dist.toFixed(0)} · TP ${sig.target_dist.toFixed(0)}
                </p>
                <p className="line-clamp-2 text-xs text-zinc-600" title={sig.reason}>
                  {sig.reason}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm tabular-nums text-zinc-400">
                Last bar {r.last_bar != null ? priceUsd(r.last_bar) : markPrice ? priceUsd(markPrice) : "—"}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
