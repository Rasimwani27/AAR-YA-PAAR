import type { ReactNode } from "react";

import { PnlCell } from "@/app/components/metric-card";
import type { TradeAnalytics } from "@/lib/types";
import { usd } from "@/lib/format";

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-base font-semibold tabular-nums text-zinc-100">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-zinc-600">{hint}</p> : null}
    </div>
  );
}

function rrLabel(stated?: number, realized?: number | null) {
  const s = stated != null ? `1:${stated}` : "—";
  const r = realized != null ? `1:${realized.toFixed(2)}` : "—";
  return `${s} stated · ${r} realized (avg win ÷ avg loss)`;
}

export function AnalysisPanel({ analytics }: { analytics: TradeAnalytics }) {
  const pf =
    analytics.profit_factor == null
      ? "— (no losses)"
      : analytics.wins === 0 && analytics.losses > 0
        ? "0.00 (no wins yet)"
        : analytics.profit_factor.toFixed(2);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm">
      <div className="border-b border-zinc-800/80 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-200">Trading analysis</h2>
        <p className="text-xs text-zinc-500">
          Win/loss breakdown, risk–reward, exits, streaks, and daily P&amp;L totals
        </p>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Stat
          label="Trades"
          value={
            <>
              {analytics.trade_count}{" "}
              <span className="text-sm font-normal text-zinc-500">
                ({analytics.wins}W · {analytics.losses}L
                {analytics.breakeven > 0 ? ` · ${analytics.breakeven} flat` : ""})
              </span>
            </>
          }
          hint={`Win rate ${analytics.win_rate_pct.toFixed(1)}%`}
        />
        <Stat
          label="Risk : reward"
          value={
            analytics.stated_rr != null ? (
              <>1:{analytics.stated_rr}</>
            ) : (
              "—"
            )
          }
          hint={rrLabel(analytics.stated_rr, analytics.realized_rr)}
        />
        <Stat
          label="Stop / target (USDT)"
          value={
            analytics.stated_stop_usdt != null && analytics.stated_target_usdt != null ? (
              <>
                ${analytics.stated_stop_usdt} / ${analytics.stated_target_usdt.toLocaleString()}
              </>
            ) : (
              "—"
            )
          }
        />
        <Stat label="Profit factor" value={pf} hint="Gross wins ÷ gross losses" />
        <Stat
          label="Expectancy / trade"
          value={<PnlCell value={analytics.expectancy_usd} />}
        />
        <Stat
          label="Best trade"
          value={<PnlCell value={analytics.best_trade_usd} />}
        />
        <Stat
          label="Worst trade"
          value={<PnlCell value={analytics.worst_trade_usd} />}
        />
        <Stat
          label="Avg win / avg loss"
          value={
            <>
              {analytics.avg_win_usd != null ? (
                <span className="text-emerald-400">{usd(analytics.avg_win_usd)}</span>
              ) : (
                "—"
              )}
              <span className="mx-1 text-zinc-600">/</span>
              {analytics.avg_loss_usd != null ? (
                <span className="text-rose-400">{usd(analytics.avg_loss_usd)}</span>
              ) : (
                "—"
              )}
            </>
          }
        />
        <Stat label="Total fees" value={usd(analytics.total_fees_usd)} />
        <Stat
          label="Exits"
          value={
            <>
              {analytics.targets_hit} target · {analytics.stops_hit} stop
              {analytics.other_exits > 0 ? ` · ${analytics.other_exits} other` : ""}
            </>
          }
        />
        <Stat
          label="Max win streak"
          value={`${analytics.max_consecutive_wins} trades`}
        />
        <Stat
          label="Max loss streak"
          value={`${analytics.max_consecutive_losses} trades`}
        />
        <Stat
          label="Trading days"
          value={
            <>
              <span className="text-emerald-400">{analytics.profitable_days} green</span>
              <span className="mx-1 text-zinc-600">·</span>
              <span className="text-rose-400">{analytics.losing_days} red</span>
              {analytics.flat_days > 0 ? (
                <>
                  <span className="mx-1 text-zinc-600">·</span>
                  <span className="text-zinc-400">{analytics.flat_days} flat</span>
                </>
              ) : null}
            </>
          }
          hint="Calendar uses exit-day UTC"
        />
      </div>
    </div>
  );
}
