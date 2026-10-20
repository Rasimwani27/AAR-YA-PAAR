"use client";

import { StrategyBadge } from "@/app/components/strategy-badge";
import { PnlCell } from "@/app/components/metric-card";
import type { ForwardExchangePosition, ForwardPosition } from "@/lib/forward-state";
import { priceUsd, usd } from "@/lib/format";

function SidePill({ side }: { side: "long" | "short" }) {
  return (
    <span
      className={
        side === "long"
          ? "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300"
          : "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300"
      }
    >
      {side}
    </span>
  );
}

function PositionCard({ p }: { p: ForwardPosition }) {
  const progress = p.progress_to_target_pct;
  return (
    <article className="rounded-xl border border-zinc-700/80 bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 p-4 shadow-lg ring-1 ring-white/5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StrategyBadge id={p.strategy_id} />
          <SidePill side={p.side} />
        </div>
        <PnlCell value={p.unrealized_pnl_usd} />
      </div>
      <p className="mt-2 text-lg font-semibold tabular-nums text-zinc-100">
        {priceUsd(p.entry_price)}{" "}
        <span className="text-sm font-normal text-zinc-500">→ mark {priceUsd(p.mark_price)}</span>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-400">
        <div>
          <span className="text-zinc-500">Stop</span>
          <p className="tabular-nums text-rose-300/90">{priceUsd(p.stop_price)}</p>
        </div>
        <div>
          <span className="text-zinc-500">Target</span>
          <p className="tabular-nums text-emerald-300/90">{priceUsd(p.target_price)}</p>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-[10px] uppercase tracking-wide text-zinc-500">
          <span>Progress to target</span>
          <span>{progress.toFixed(0)}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-xs text-zinc-500" title={p.reason}>
        {p.reason}
      </p>
      <p className="mt-1 text-[10px] text-zinc-600">Opened {new Date(p.opened_at).toLocaleString()}</p>
    </article>
  );
}

export function LivePositionsPanel({
  paper,
  exchange,
  markPrice,
}: {
  paper: ForwardPosition[];
  exchange: ForwardExchangePosition[];
  markPrice?: number;
}) {
  const live = exchange.filter((e) => !e.error && e.qty);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Live positions</h2>
          <p className="text-xs text-zinc-500">
            Paper book from signals · testnet exchange when connected
            {markPrice ? ` · BTC mark ${usd(markPrice)}` : ""}
          </p>
        </div>
        <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400">
          {paper.length} paper · {live.length} exchange
        </span>
      </div>

      {paper.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700/80 bg-zinc-950/40 px-4 py-8 text-center text-sm text-zinc-500">
          No open paper positions. When a strategy fires a signal on a tick, it appears here with live unrealized P&amp;L.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {paper.map((p) => (
            <PositionCard key={p.id} p={p} />
          ))}
        </div>
      )}

      {live.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/40">
          <div className="border-b border-zinc-800/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Binance testnet (actual)
          </div>
          <ul className="divide-y divide-zinc-800/60">
            {live.map((e, i) => (
              <li key={`${e.symbol}-${i}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-medium text-zinc-200">{e.symbol}</span>
                <SidePill side={e.side ?? "long"} />
                <span className="tabular-nums text-zinc-400">qty {e.qty}</span>
                <PnlCell value={e.unrealized_pnl ?? 0} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
