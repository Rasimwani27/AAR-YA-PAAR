export type ForwardSide = "long" | "short";

export type ForwardPosition = {
  id: string;
  strategy_id: string;
  strategy_name: string;
  side: ForwardSide;
  entry_price: number;
  stop_price: number;
  target_price: number;
  qty: number;
  stop_usdt: number;
  target_usdt: number;
  opened_at: string;
  reason: string;
  mark_price: number;
  unrealized_pnl_usd: number;
  progress_to_target_pct: number;
};

export type ForwardClosedTrade = {
  id: string;
  strategy_id: string;
  strategy_name: string;
  side: ForwardSide;
  entry_price: number;
  exit_price: number;
  qty: number;
  gross_pnl_usd: number;
  opened_at: string;
  closed_at: string;
  exit_reason: "target" | "stop" | "manual" | "signal_replace";
  hold_minutes: number;
  reason: string;
};

export type ForwardStrategyResult = {
  label: string;
  strategy?: string;
  signal?: {
    side: ForwardSide;
    entry_price: number;
    stop_dist: number;
    target_dist: number;
    reason: string;
  } | null;
  last_bar?: number;
  error?: string;
  position_opened?: string;
};

export type ForwardExchangePosition = {
  symbol?: string;
  side?: ForwardSide;
  qty?: number;
  entry_price?: number;
  mark_price?: number;
  unrealized_pnl?: number;
  leverage?: string;
  error?: string;
};

export type ForwardStats = {
  open_count: number;
  closed_trades: number;
  wins: number;
  losses: number;
  win_rate_pct: number;
  realized_pnl_usd: number;
  unrealized_pnl_usd: number;
  total_pnl_usd: number;
  today_realized_usd: number;
  by_strategy: {
    strategy_id: string;
    strategy_name: string;
    trades: number;
    wins: number;
    net_usd: number;
  }[];
};

export type ForwardState = {
  ok?: boolean;
  updated_at?: string;
  mark_price?: number;
  probe?: {
    totalWalletBalance?: string;
    availableBalance?: string;
    canTrade?: boolean;
  };
  results?: ForwardStrategyResult[];
  positions?: ForwardPosition[];
  history?: ForwardClosedTrade[];
  stats?: ForwardStats;
  exchange_positions?: ForwardExchangePosition[];
  closed_this_tick?: ForwardClosedTrade[];
};

export function strategyLabel(id: string): string {
  if (id === "fade-reversal") return "Fade-reversal";
  if (id === "london-mid-engulf") return "London mid";
  return id;
}

export function strategyTone(id: string): "sky" | "amber" | "zinc" {
  if (id === "fade-reversal") return "sky";
  if (id === "london-mid-engulf") return "amber";
  return "zinc";
}
