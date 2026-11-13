import type { ForwardClosedTrade } from "@/lib/forward-state";

/** Net realized USD for stats/history — prefers Bybit net when present. */
export function tradeRealizedUsd(t: ForwardClosedTrade): number {
  if (t.source === "bybit" && t.net_pnl_usd != null) return t.net_pnl_usd;
  if (t.net_pnl_usd != null) return t.net_pnl_usd;
  return t.gross_pnl_usd;
}
