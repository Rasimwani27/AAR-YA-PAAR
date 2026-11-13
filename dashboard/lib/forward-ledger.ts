import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BybitClosedPnlRow } from "@/lib/bybit-closed-pnl";
import { mapBybitRowToClosedTrade } from "@/lib/bybit-closed-pnl";
import { roundTradeQty, stopDistanceUsd } from "@/lib/trade-qty";
import { tradeRealizedUsd } from "@/lib/trade-realized-pnl";
import type {
  ForwardClosedTrade,
  ForwardPosition,
  ForwardSide,
  ForwardState,
  ForwardStats,
} from "@/lib/forward-state";

export const MANUAL_STRATEGY_ID = "manual";

export type ManualSizingMode = "risk" | "qty" | "notional";

export type ManualTradePrefs = {
  account_equity_usd: number;
  risk_pct_per_trade: number;
  default_leverage: number;
  default_stop_usd: number;
  default_target_usd: number;
  sizing_mode: ManualSizingMode;
  symbol: string;
};

export const DEFAULT_MANUAL_PREFS: ManualTradePrefs = {
  account_equity_usd: 1000,
  risk_pct_per_trade: 1,
  default_leverage: 10,
  default_stop_usd: 500,
  default_target_usd: 1500,
  sizing_mode: "risk",
  symbol: "BTCUSDT",
};

type RawOpenPosition = {
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
  signal_bar_ms?: number | null;
  manual?: boolean;
  leverage?: number;
  risk_pct?: number;
  notional_usd?: number;
  account_equity_usd?: number;
  bybit_order_id?: string;
  bybit_live?: boolean;
};

export type RawLedger = {
  positions: RawOpenPosition[];
  history: ForwardClosedTrade[];
};

function ledgerPath(root: string) {
  return path.join(root, "out", "forward", "ledger.json");
}

function prefsPath(root: string) {
  return path.join(root, "out", "forward", "manual_prefs.json");
}

function statePath(root: string) {
  return path.join(root, "out", "forward", "state.json");
}

export function loadManualPrefs(root: string): ManualTradePrefs {
  const p = prefsPath(root);
  if (!existsSync(p)) return { ...DEFAULT_MANUAL_PREFS };
  try {
    const raw = JSON.parse(readFileSync(p, "utf-8")) as Partial<ManualTradePrefs>;
    return { ...DEFAULT_MANUAL_PREFS, ...raw };
  } catch {
    return { ...DEFAULT_MANUAL_PREFS };
  }
}

export function saveManualPrefs(root: string, prefs: ManualTradePrefs): ManualTradePrefs {
  const out = path.join(root, "out", "forward");
  mkdirSync(out, { recursive: true });
  const merged = { ...DEFAULT_MANUAL_PREFS, ...prefs };
  writeFileSync(prefsPath(root), JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

export function loadLedgerSnapshot(root: string): RawLedger {
  return loadLedger(root);
}

function loadLedger(root: string): RawLedger {
  const p = ledgerPath(root);
  if (!existsSync(p)) return { positions: [], history: [] };
  try {
    const raw = JSON.parse(readFileSync(p, "utf-8")) as RawLedger;
    return {
      positions: raw.positions ?? [],
      history: raw.history ?? [],
    };
  } catch {
    return { positions: [], history: [] };
  }
}

export function saveLedgerSnapshot(root: string, ledger: RawLedger) {
  saveLedger(root, ledger);
}

function saveLedger(root: string, ledger: RawLedger) {
  const out = path.join(root, "out", "forward");
  mkdirSync(out, { recursive: true });
  writeFileSync(ledgerPath(root), JSON.stringify(ledger, null, 2), "utf-8");
}

function unrealizedPnl(pos: RawOpenPosition, mark: number): number {
  if (pos.side === "long") return (mark - pos.entry_price) * pos.qty;
  return (pos.entry_price - mark) * pos.qty;
}

function progressToTarget(pos: RawOpenPosition, mark: number): number {
  const span = Math.abs(pos.target_price - pos.entry_price);
  if (span <= 0) return 0;
  if (pos.side === "long") {
    return Math.max(0, Math.min(100, ((mark - pos.entry_price) / span) * 100));
  }
  return Math.max(0, Math.min(100, ((pos.entry_price - mark) / span) * 100));
}

export function positionToPublic(pos: RawOpenPosition, mark: number): ForwardPosition {
  return {
    ...pos,
    mark_price: mark,
    unrealized_pnl_usd: Math.round(unrealizedPnl(pos, mark) * 100) / 100,
    progress_to_target_pct: Math.round(progressToTarget(pos, mark) * 10) / 10,
    manual: pos.manual ?? pos.strategy_id === MANUAL_STRATEGY_ID,
    leverage: pos.leverage ?? 1,
    risk_pct: pos.risk_pct ?? 0,
    notional_usd: pos.notional_usd ?? pos.entry_price * pos.qty,
    account_equity_usd: pos.account_equity_usd ?? 0,
  };
}

export function computeForwardStats(ledger: RawLedger, mark: number): ForwardStats {
  const history = ledger.history;
    const wins = history.filter((t) => tradeRealizedUsd(t) > 0).length;
    const losses = history.filter((t) => tradeRealizedUsd(t) < 0).length;
  const total = history.length;
  const net = history.reduce((s, t) => s + tradeRealizedUsd(t), 0);
  const unrealized = ledger.positions.reduce((s, p) => s + unrealizedPnl(p, mark), 0);
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
  return {
    open_count: ledger.positions.length,
    closed_trades: total,
    wins,
    losses,
    win_rate_pct: total ? Math.round((wins / total) * 1000) / 10 : 0,
    realized_pnl_usd: Math.round(net * 100) / 100,
    unrealized_pnl_usd: Math.round(unrealized * 100) / 100,
    total_pnl_usd: Math.round((net + unrealized) * 100) / 100,
    today_realized_usd: Math.round(todayNet * 100) / 100,
    by_strategy: [...byStrategy.values()],
  };
}

export function refreshForwardStateFile(root: string, mark: number, nowIso = new Date().toISOString()) {
  const ledger = loadLedger(root);

  let prev: Partial<ForwardState> = {};
  const sp = statePath(root);
  if (existsSync(sp)) {
    try {
      prev = JSON.parse(readFileSync(sp, "utf-8")) as Partial<ForwardState>;
    } catch {
      prev = {};
    }
  }

  const payload: ForwardState = {
    ...prev,
    ok: true,
    updated_at: nowIso,
    mark_price: mark,
    positions: [],
    history: ledger.history.slice(0, 100),
    stats: computeForwardStats({ positions: [], history: ledger.history }, mark),
  };
  mkdirSync(path.dirname(sp), { recursive: true });
  writeFileSync(sp, JSON.stringify(payload, null, 2), "utf-8");
  return { ledger, state: payload };
}

/** Merge cached Bybit trade history + mark; open positions come from exchange sync only. */
export async function enrichForwardStateFromLedger(
  root: string,
  prev: ForwardState,
): Promise<ForwardState> {
  let mark = prev.mark_price;
  try {
    mark = await fetchBtcMarkPrice();
  } catch {
    if (!mark || mark <= 0) mark = prev.exchange_positions?.[0]?.mark_price ?? 0;
  }
  if (!mark || mark <= 0) return prev;

  const ledger = loadLedger(root);
  if (!ledger.history.length) {
    return { ...prev, mark_price: mark, updated_at: new Date().toISOString(), positions: [] };
  }

  return {
    ...prev,
    ok: prev.ok ?? true,
    mark_price: mark,
    updated_at: new Date().toISOString(),
    positions: [],
    history: ledger.history.slice(0, 100),
    stats: computeForwardStats({ positions: [], history: ledger.history }, mark),
  };
}

export async function fetchBtcMarkPrice(): Promise<number> {
  const url = "https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT";
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Mark price HTTP ${res.status}`);
  const data = (await res.json()) as {
    result?: { list?: { markPrice?: string; lastPrice?: string }[] };
  };
  const row = data.result?.list?.[0];
  const mark = parseFloat(row?.markPrice ?? row?.lastPrice ?? "");
  if (!Number.isFinite(mark) || mark <= 0) throw new Error("Could not parse BTC mark price");
  return mark;
}

export function resolveMarkPrice(root: string, override?: number): number {
  if (override != null && Number.isFinite(override) && override > 0) return override;
  const sp = statePath(root);
  if (existsSync(sp)) {
    try {
      const st = JSON.parse(readFileSync(sp, "utf-8")) as { mark_price?: number };
      if (st.mark_price && st.mark_price > 0) return st.mark_price;
    } catch {
      /* ignore */
    }
  }
  throw new Error("No mark price — run a forward tick or pass entry/mark in the request");
}

export function calcQtyFromPrefs(
  prefs: ManualTradePrefs,
  entry: number,
  stopPrice: number,
  overrides?: { qty?: number; notional_usd?: number; risk_pct?: number },
): { qty: number; risk_usd: number; risk_pct: number } {
  const riskPct = overrides?.risk_pct ?? prefs.risk_pct_per_trade;
  const riskUsd = (prefs.account_equity_usd * riskPct) / 100;
  const stopDist = stopDistanceUsd(entry, stopPrice);
  const equity = Math.max(0, prefs.account_equity_usd);

  if (overrides?.qty != null && overrides.qty > 0) {
    const q = roundTradeQty(overrides.qty);
    return { qty: q, risk_usd: stopDist * q, risk_pct: riskPct };
  }
  if (overrides?.notional_usd != null && overrides.notional_usd > 0) {
    const qty = roundTradeQty(overrides.notional_usd / entry);
    return { qty, risk_usd: stopDist * qty, risk_pct: riskPct };
  }
  if (prefs.sizing_mode === "notional" && !overrides?.qty) {
    const notional = equity * (prefs.default_leverage / 10);
    const qty = roundTradeQty(notional / entry);
    return { qty, risk_usd: stopDist * qty, risk_pct: riskPct };
  }
  const riskUsdLive = (equity * riskPct) / 100;
  const qty = roundTradeQty(riskUsdLive / stopDist);
  return { qty, risk_usd: riskUsdLive, risk_pct: riskPct };
}

function roundQty(qty: number) {
  return roundTradeQty(qty);
}

export type OpenManualInput = {
  side: ForwardSide;
  entry_price?: number;
  stop_price?: number;
  target_price?: number;
  stop_usd?: number;
  target_usd?: number;
  qty?: number;
  notional_usd?: number;
  leverage?: number;
  risk_pct?: number;
  reason?: string;
};

export type ComputedManualLegs = {
  entry: number;
  stopPrice: number;
  targetPrice: number;
  qty: number;
  leverage: number;
  riskPct: number;
  symbol: string;
};

export function computeManualTradeLegs(
  root: string,
  input: OpenManualInput,
  mark: number,
  equityUsd?: number,
): ComputedManualLegs {
  const basePrefs = loadManualPrefs(root);
  const prefs =
    equityUsd != null && Number.isFinite(equityUsd) && equityUsd > 0
      ? { ...basePrefs, account_equity_usd: equityUsd }
      : basePrefs;
  const entry = input.entry_price ?? mark;
  const leverage = input.leverage ?? prefs.default_leverage;
  const riskPct = input.risk_pct ?? prefs.risk_pct_per_trade;
  let stopPrice = input.stop_price;
  let targetPrice = input.target_price;
  const stopUsd = input.stop_usd ?? prefs.default_stop_usd;
  const targetUsd = input.target_usd ?? prefs.default_target_usd;
  if (stopPrice == null) {
    stopPrice = input.side === "long" ? entry - stopUsd : entry + stopUsd;
  }
  if (targetPrice == null) {
    targetPrice = input.side === "long" ? entry + targetUsd : entry - targetUsd;
  }
  const sized = calcQtyFromPrefs(prefs, entry, stopPrice, {
    qty: input.qty,
    notional_usd: input.notional_usd,
    risk_pct: riskPct,
  });
  if (input.side === "long") {
    if (stopPrice >= entry || targetPrice <= entry) {
      throw new Error("Long: stop below entry, target above entry");
    }
  } else if (stopPrice <= entry || targetPrice >= entry) {
    throw new Error("Short: stop above entry, target below entry");
  }
  return {
    entry,
    stopPrice,
    targetPrice,
    qty: sized.qty,
    leverage,
    riskPct,
    symbol: prefs.symbol,
  };
}

export function openManualPosition(
  root: string,
  input: OpenManualInput,
  mark: number,
  extra?: { bybit_order_id?: string; bybit_live?: boolean; entry_fill?: number },
) {
  const prefs = loadManualPrefs(root);
  const nowIso = new Date().toISOString();
  const legs = computeManualTradeLegs(root, input, mark);
  const entry = extra?.entry_fill ?? legs.entry;
  const stopPrice = legs.stopPrice;
  const targetPrice = legs.targetPrice;
  const leverage = legs.leverage;
  const riskPct = legs.riskPct;
  const sized = { qty: legs.qty };
  const ledger = loadLedger(root);
  const pos: RawOpenPosition = {
    id: randomUUID(),
    strategy_id: MANUAL_STRATEGY_ID,
    strategy_name: "Manual",
    side: input.side,
    entry_price: Math.round(entry * 100) / 100,
    stop_price: Math.round(stopPrice * 100) / 100,
    target_price: Math.round(targetPrice * 100) / 100,
    qty: sized.qty,
    stop_usdt: Math.round(Math.abs(entry - stopPrice) * sized.qty * 100) / 100,
    target_usdt: Math.round(Math.abs(targetPrice - entry) * sized.qty * 100) / 100,
    opened_at: nowIso,
    reason: input.reason?.trim() || "Manual entry from dashboard",
    manual: true,
    leverage,
    risk_pct: riskPct,
    notional_usd: Math.round(entry * sized.qty * 100) / 100,
    account_equity_usd: prefs.account_equity_usd,
    bybit_order_id: extra?.bybit_order_id,
    bybit_live: extra?.bybit_live ?? false,
  };
  ledger.positions.push(pos);
  saveLedger(root, ledger);
  return refreshForwardStateFile(root, mark, nowIso);
}

export type UpdateManualInput = {
  position_id: string;
  stop_price?: number;
  target_price?: number;
  qty?: number;
  leverage?: number;
  risk_pct?: number;
  reason?: string;
};

export function getManualPosition(root: string, positionId: string) {
  const ledger = loadLedger(root);
  const pos = ledger.positions.find((p) => p.id === positionId);
  if (!pos) throw new Error("Position not found");
  return pos;
}

export function updateManualPosition(root: string, input: UpdateManualInput, mark: number) {
  const ledger = loadLedger(root);
  const idx = ledger.positions.findIndex((p) => p.id === input.position_id);
  if (idx < 0) throw new Error("Position not found");
  const pos = ledger.positions[idx];
  if (input.stop_price != null) pos.stop_price = Math.round(input.stop_price * 100) / 100;
  if (input.target_price != null) pos.target_price = Math.round(input.target_price * 100) / 100;
  if (input.qty != null) pos.qty = roundQty(input.qty);
  if (input.leverage != null) pos.leverage = input.leverage;
  if (input.risk_pct != null) pos.risk_pct = input.risk_pct;
  if (input.reason != null) pos.reason = input.reason;
  pos.stop_usdt =
    Math.round(Math.abs(pos.entry_price - pos.stop_price) * pos.qty * 100) / 100;
  pos.target_usdt =
    Math.round(Math.abs(pos.target_price - pos.entry_price) * pos.qty * 100) / 100;
  pos.notional_usd = Math.round(pos.entry_price * pos.qty * 100) / 100;
  ledger.positions[idx] = pos;
  saveLedger(root, ledger);
  return refreshForwardStateFile(root, mark);
}

export function partialCloseManualPosition(
  root: string,
  positionId: string,
  closeQty: number,
  mark: number,
  exitPrice?: number,
  bybitRow?: BybitClosedPnlRow | null,
) {
  const ledger = loadLedger(root);
  const idx = ledger.positions.findIndex((p) => p.id === positionId);
  if (idx < 0) throw new Error("Position not found");
  const pos = ledger.positions[idx];
  const qty = Math.min(closeQty, pos.qty);
  if (qty <= 0) throw new Error("close_qty must be positive");
  const nowIso = bybitRow ? new Date(bybitRow.created_time_ms).toISOString() : new Date().toISOString();
  const px = bybitRow?.avg_exit_price ?? exitPrice ?? mark;

  let trade: ForwardClosedTrade;
  if (bybitRow) {
    trade = mapBybitRowToClosedTrade(bybitRow, {
      position_id: pos.id,
      strategy_id: pos.strategy_id,
      strategy_name: pos.strategy_name,
      opened_at: pos.opened_at,
      exit_reason: "manual",
      reason: `${pos.reason} (partial close)`,
    });
    trade.id = `${pos.id}-partial-${bybitRow.id}`;
  } else {
    throw new Error("Partial close requires Bybit closed-P&L for the executed slice.");
  }
  ledger.history.unshift(trade);
  pos.qty = roundQty(pos.qty - qty);
  pos.notional_usd = Math.round(pos.entry_price * pos.qty * 100) / 100;
  pos.stop_usdt = Math.round(Math.abs(pos.entry_price - pos.stop_price) * pos.qty * 100) / 100;
  pos.target_usdt = Math.round(Math.abs(pos.target_price - pos.entry_price) * pos.qty * 100) / 100;
  if (pos.qty < 1e-8) {
    ledger.positions.splice(idx, 1);
  } else {
    ledger.positions[idx] = pos;
  }
  ledger.history = ledger.history.slice(0, 500);
  saveLedger(root, ledger);
  return refreshForwardStateFile(root, mark, nowIso);
}

export function closeManualPosition(
  root: string,
  positionId: string,
  mark: number,
  exitPrice?: number,
  bybitRow?: BybitClosedPnlRow | null,
  exitReason: ForwardClosedTrade["exit_reason"] = "manual",
) {
  const ledger = loadLedger(root);
  const idx = ledger.positions.findIndex((p) => p.id === positionId);
  if (idx < 0) throw new Error("Position not found");
  const pos = ledger.positions[idx];
  const nowIso = bybitRow ? new Date(bybitRow.created_time_ms).toISOString() : new Date().toISOString();

  let trade: ForwardClosedTrade;
  if (bybitRow) {
    trade = mapBybitRowToClosedTrade(bybitRow, {
      position_id: pos.id,
      strategy_id: pos.strategy_id,
      strategy_name: pos.strategy_name,
      opened_at: pos.opened_at,
      exit_reason: exitReason,
      reason: pos.reason,
    });
    trade.id = pos.id.includes("::") ? pos.id : `${pos.id}::${bybitRow.id}`;
  } else {
    throw new Error("Cannot close without Bybit closed-P&L — execute close on the exchange first.");
  }

  ledger.positions.splice(idx, 1);
  ledger.history.unshift(trade);
  ledger.history = ledger.history.slice(0, 500);
  saveLedger(root, ledger);
  return refreshForwardStateFile(root, mark, nowIso);
}

/** Close an open ledger row using authoritative Bybit closed-P&L (position removed from book). */
export function closeManualPositionWithBybit(
  root: string,
  positionId: string,
  bybitRow: BybitClosedPnlRow,
  opts?: { exit_reason?: ForwardClosedTrade["exit_reason"] },
) {
  const mark = bybitRow.avg_exit_price;
  return closeManualPosition(root, positionId, mark, bybitRow.avg_exit_price, bybitRow, opts?.exit_reason ?? "exchange");
}

export function mergeExchangeIntoState(state: ForwardState, exchange_positions: unknown[]): ForwardState {
  const rows = exchange_positions as ForwardState["exchange_positions"];
  const unrealized = (rows ?? []).reduce((s, r) => s + Number(r?.unrealized_pnl ?? 0), 0);
  return {
    ...state,
    exchange_positions: rows,
    exchange_stats: {
      unrealized_usd: Math.round(unrealized * 100) / 100,
      position_count: rows?.length ?? 0,
    },
  };
}
