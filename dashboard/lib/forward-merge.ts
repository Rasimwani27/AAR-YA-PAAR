import type { ForwardState } from "@/lib/forward-state";

/** Merge exchange sync payloads without dropping history or the active environment. */
export function mergeForwardState(prev: ForwardState | null, patch: Partial<ForwardState>): ForwardState {
  const base: ForwardState = prev ? { ...prev } : { ok: true };
  const next: ForwardState = { ...base, ...patch, ok: patch.ok ?? base.ok ?? true };

  if (!patch.history?.length && base.history?.length) {
    next.history = base.history;
  }
  if (!patch.stats && base.stats) {
    next.stats = base.stats;
  }
  if (!patch.results?.length && base.results?.length) {
    next.results = base.results;
  }
  if (patch.bybit_environment) {
    next.bybit_environment = patch.bybit_environment;
  }
  if (patch.exchange_positions) {
    next.exchange_positions = patch.exchange_positions;
  }
  if (patch.exchange_stats) {
    next.exchange_stats = patch.exchange_stats;
  }
  if (patch.bybit_open_orders) {
    next.bybit_open_orders = patch.bybit_open_orders;
  }
  if (patch.bybit_wallet) {
    next.bybit_wallet = patch.bybit_wallet;
  }
  if (patch.mark_price != null && patch.mark_price > 0) {
    next.mark_price = patch.mark_price;
  }
  return next;
}
