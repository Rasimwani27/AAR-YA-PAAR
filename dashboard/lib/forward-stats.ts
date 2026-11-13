import { tradeRealizedUsd } from "@/lib/trade-realized-pnl";
import type { ForwardExchangePosition, ForwardPosition, ForwardState, ForwardStats } from "@/lib/forward-state";

export function sumExchangeUnrealized(exchange: ForwardExchangePosition[] | undefined): number {
  if (!exchange?.length) return 0;
  return exchange.reduce((sum, row) => {
    if (row.error) return sum;
    const v = Number(row.unrealized_pnl ?? 0);
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);
}

export function unrealizedAtMark(p: ForwardPosition, mark?: number): number {
  const m = mark ?? p.mark_price;
  if (!Number.isFinite(m) || m <= 0) return p.unrealized_pnl_usd ?? 0;
  if (p.side === "long") return (m - p.entry_price) * p.qty;
  return (p.entry_price - m) * p.qty;
}

/** Stats from Bybit history (realized) + exchange unrealized. */
export function deriveForwardStats(state: ForwardState, mark?: number): ForwardStats {
  const history = state.history ?? [];
  const exchangeUpnl = sumExchangeUnrealized(state.exchange_positions);
  const unrealized = exchangeUpnl;
  const wins = history.filter((t) => tradeRealizedUsd(t) > 0).length;
  const losses = history.filter((t) => tradeRealizedUsd(t) < 0).length;
  const total = history.length;
  const net = history.reduce((s, t) => s + tradeRealizedUsd(t), 0);
  const today = new Date().toISOString().slice(0, 10);
  const todayNet = history
    .filter((t) => t.closed_at.startsWith(today))
    .reduce((s, t) => s + tradeRealizedUsd(t), 0);
  const byStrategy = new Map<
    string,
    { strategy_id: string; strategy_name: string; trades: number; wins: number; net_usd: number }
  >();
  for (const t of history) {
    const bucket =
      byStrategy.get(t.strategy_id) ??
      ({
        strategy_id: t.strategy_id,
        strategy_name: t.strategy_name,
        trades: 0,
        wins: 0,
        net_usd: 0,
      } as const);
    const next = {
      ...bucket,
      trades: bucket.trades + 1,
      wins: bucket.wins + (tradeRealizedUsd(t) > 0 ? 1 : 0),
      net_usd: Math.round((bucket.net_usd + tradeRealizedUsd(t)) * 100) / 100,
    };
    byStrategy.set(t.strategy_id, next);
  }
  const realized = Math.round(net * 100) / 100;
  const open = Math.round(unrealized * 100) / 100;
  return {
    open_count: state.exchange_stats?.position_count ?? state.exchange_positions?.filter((e) => !e.error && e.qty).length ?? 0,
    closed_trades: total,
    wins,
    losses,
    win_rate_pct: total ? Math.round((wins / total) * 1000) / 10 : 0,
    realized_pnl_usd: realized,
    unrealized_pnl_usd: open,
    total_pnl_usd: Math.round((realized + open) * 100) / 100,
    today_realized_usd: Math.round(todayNet * 100) / 100,
    by_strategy: [...byStrategy.values()],
  };
}

/**
 * Never trust stale `state.stats` for open P&amp;L — recompute from positions + mark every render.
 */
export function resolveForwardStats(state: ForwardState | null | undefined): ForwardStats | null {
  if (!state) return null;
  return deriveForwardStats(state);
}

export function combinedPnlUsdt(_ignored: number, exchangeUpnl: number): number {
  return Math.round(exchangeUpnl * 100) / 100;
}
