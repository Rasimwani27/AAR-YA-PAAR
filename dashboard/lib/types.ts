export type YearRow = {
  year: number;
  trades: number;
  wins: number;
  losses: number;
  win_pct: number;
  gross: number;
  fees: number;
  net: number;
  return_pct: number;
  equity_end: number;
};

export type DailyPnlRow = {
  date: string;
  net_pnl: number;
  trades: number;
  wins: number;
  losses: number;
};

export type TradeAnalytics = {
  trade_count: number;
  wins: number;
  losses: number;
  breakeven: number;
  win_rate_pct: number;
  stated_rr?: number;
  stated_stop_usdt?: number;
  stated_target_usdt?: number;
  realized_rr: number | null;
  profit_factor: number | null;
  expectancy_usd: number;
  best_trade_usd: number;
  worst_trade_usd: number;
  avg_win_usd: number | null;
  avg_loss_usd: number | null;
  total_fees_usd: number;
  targets_hit: number;
  stops_hit: number;
  other_exits: number;
  max_consecutive_wins: number;
  max_consecutive_losses: number;
  profitable_days: number;
  losing_days: number;
  flat_days: number;
  daily_pnl: DailyPnlRow[];
};

export type BacktestReport = {
  meta: {
    start: string;
    end: string;
    symbol: string;
    strategy: string;
    risk_pct?: number;
    stop_usdt?: number;
    target_usdt?: number;
    rr?: number;
    risk_label?: string;
  };
  initial_equity: number;
  rows: YearRow[];
  summary: {
    trades: number;
    wins: number;
    losses: number;
    win_pct: number;
    gross: number;
    fees: number;
    net: number;
    roi_pct: number;
    final_equity: number;
  };
  analytics?: TradeAnalytics;
};

export type HealthResponse = {
  ok: boolean;
  mode?: "hosted" | "local";
  hosted?: boolean;
  message?: string;
  filesOk?: boolean;
  repoRoot?: string;
  cwd?: string;
  inferredFrom?: string | null;
  engineError?: string | null;
  backtestProbeError?: string | null;
  backtestProbeOk?: boolean;
  disableExec?: boolean;
  python?: string;
  pythonSpawn?: string;
  integratedBacktest?: boolean;
  forwardTest?: boolean;
};
