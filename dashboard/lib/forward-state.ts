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
  manual?: boolean;
  leverage?: number;
  risk_pct?: number;
  notional_usd?: number;
  account_equity_usd?: number;
  bybit_order_id?: string;
  bybit_live?: boolean;
};

export type ForwardClosedTrade = {
  id: string;
  strategy_id: string;
  strategy_name: string;
  side: ForwardSide;
  entry_price: number;
  exit_price: number;
  qty: number;
  /** Gross closed P&L from exchange or paper formula (before fees). */
  gross_pnl_usd: number;
  /** Net realized P&L after fees when sourced from Bybit. */
  net_pnl_usd?: number;
  open_fee_usd?: number;
  close_fee_usd?: number;
  funding_fee_usd?: number;
  opened_at: string;
  closed_at: string;
  exit_reason: "target" | "stop" | "manual" | "signal_replace" | "exchange";
  hold_minutes: number;
  reason: string;
  source?: "bybit" | "legacy";
  bybit_environment?: "demo" | "mainnet";
  bybit_closed_pnl_id?: string;
  bybit_order_id?: string;
  needs_reconcile?: boolean;
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
  liquidation_price?: number;
  position_value?: number;
  cum_realised_pnl?: number;
  error?: string;
};

export type ForwardBybitOpenOrder = {
  orderId: string;
  symbol: string;
  side: "Buy" | "Sell";
  orderType: string;
  price: number;
  qty: number;
  cumExecQty: number;
  leavesQty: number;
  status: string;
  createdTime: string;
  reduceOnly: boolean;
};

export type ForwardBybitWallet = {
  totalWalletBalance: number;
  availableBalance: number;
  equity: number;
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

export type ForwardExchangeStats = {
  unrealized_usd: number;
  position_count: number;
};

export type ForwardState = {
  ok?: boolean;
  updated_at?: string;
  /** "bybit" | "binance" — set by Python forward tick */
  exchange?: string;
  bybit_environment?: "demo" | "mainnet";
  mark_price?: number;
  bybit_auto_trade?: boolean;
  bybit_errors?: string[];
  probe?: {
    exchange?: string;
    totalWalletBalance?: string;
    availableBalance?: string;
    canTrade?: boolean;
  };
  results?: ForwardStrategyResult[];
  positions?: ForwardPosition[];
  history?: ForwardClosedTrade[];
  stats?: ForwardStats;
  exchange_positions?: ForwardExchangePosition[];
  exchange_stats?: ForwardExchangeStats;
  bybit_open_orders?: ForwardBybitOpenOrder[];
  bybit_wallet?: ForwardBybitWallet;
  closed_this_tick?: ForwardClosedTrade[];
};

export function strategyLabel(id: string): string {
  if (id === "fade-reversal") return "Fade-reversal";
  if (id === "london-mid-engulf") return "London mid";
  if (id === "manual") return "Manual";
  return id;
}

export function strategyTone(id: string): "sky" | "amber" | "zinc" | "violet" {
  if (id === "fade-reversal") return "sky";
  if (id === "london-mid-engulf") return "amber";
  if (id === "manual") return "violet";
  return "zinc";
}
