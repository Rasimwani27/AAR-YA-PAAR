import type { BybitEnvironment } from "@/lib/bybit-environment";
import type { BybitOpenOrder, BybitPositionRow } from "@/lib/bybit-orders";
import type { ForwardExchangePosition, ForwardState } from "@/lib/forward-state";

export function mapPositionsToExchange(positions: BybitPositionRow[]): ForwardExchangePosition[] {
  return positions.map((p) => ({
    symbol: p.symbol,
    side: p.side,
    qty: p.qty,
    entry_price: p.entry_price,
    mark_price: p.mark_price,
    unrealized_pnl: p.unrealized_pnl,
    leverage: String(p.leverage),
    liquidation_price: p.liquidation_price,
    position_value: p.position_value,
    cum_realised_pnl: p.cum_realised_pnl,
  }));
}

export function mergeBybitSnapshot(
  state: ForwardState,
  snapshot: {
    positions: BybitPositionRow[];
    open_orders: BybitOpenOrder[];
    wallet?: { totalWalletBalance: number; availableBalance: number; equity: number };
    environment?: BybitEnvironment;
  },
): ForwardState {
  const exchange_positions = mapPositionsToExchange(snapshot.positions);
  const unrealized = exchange_positions.reduce((s, r) => s + (r.unrealized_pnl ?? 0), 0);
  return {
    ...state,
    exchange_positions,
    exchange_stats: {
      unrealized_usd: Math.round(unrealized * 100) / 100,
      position_count: exchange_positions.length,
    },
    bybit_open_orders: snapshot.open_orders,
    bybit_wallet: snapshot.wallet,
    bybit_environment: snapshot.environment,
    updated_at: new Date().toISOString(),
  };
}
