"use client";

import { PnlCell } from "@/app/components/metric-card";
import type { ForwardExchangePosition } from "@/lib/forward-state";
import { bybitEnvironmentLabel } from "@/lib/bybit-environment";
import type { BybitEnvironment } from "@/lib/bybit-environment";
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

export function LivePositionsPanel({
  exchange,
  markPrice,
  bybitEnvironment,
  onCloseExchange,
}: {
  exchange: ForwardExchangePosition[];
  markPrice?: number;
  bybitEnvironment?: BybitEnvironment;
  onCloseExchange?: (e: ForwardExchangePosition) => void;
}) {
  const envLabel = bybitEnvironment ? bybitEnvironmentLabel(bybitEnvironment) : "Bybit";
  const live = exchange.filter((e) => !e.error && e.qty);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Open positions</h2>
          <p className="text-xs text-zinc-500">
            {envLabel} — live from exchange API
            {markPrice ? ` · BTC mark ${usd(markPrice)}` : ""}
          </p>
        </div>
        <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400">{live.length} open</span>
      </div>

      {live.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700/80 bg-zinc-950/40 px-4 py-8 text-center text-sm text-zinc-500">
          No open positions on {envLabel}. Strategy signals and manual orders place trades on Bybit only.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/40">
          <ul className="divide-y divide-zinc-800/60">
            {live.map((e, i) => (
              <li key={`${e.symbol}-${e.side}-${i}`} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-zinc-200">{e.symbol}</span>
                  <SidePill side={e.side ?? "long"} />
                  <PnlCell value={e.unrealized_pnl ?? 0} />
                </div>
                <div className="mt-1 grid gap-1 text-xs text-zinc-500 sm:grid-cols-3">
                  <span>Entry {e.entry_price != null ? priceUsd(e.entry_price) : "—"}</span>
                  <span>Mark {e.mark_price != null ? priceUsd(e.mark_price) : "—"}</span>
                  <span>
                    {e.qty} BTC · {e.leverage ?? 1}x
                    {e.liquidation_price ? ` · liq ${priceUsd(e.liquidation_price)}` : ""}
                  </span>
                </div>
                {onCloseExchange ? (
                  <button
                    type="button"
                    onClick={() => onCloseExchange(e)}
                    className="mt-2 rounded-lg border border-rose-500/40 px-2 py-1 text-[10px] text-rose-200 hover:bg-rose-500/10"
                  >
                    Close on Bybit (market)
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
