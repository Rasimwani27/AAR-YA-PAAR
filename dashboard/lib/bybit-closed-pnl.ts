/**
 * Bybit v5 closed P&L + execution records (source of truth for realized P&L).
 */

import type { BybitEnvironment } from "@/lib/bybit-environment";
import type { ForwardClosedTrade, ForwardSide } from "@/lib/forward-state";

export type BybitClosedPnlRow = {
  id: string;
  symbol: string;
  side: ForwardSide;
  qty: number;
  leverage: string;
  avg_entry_price: number;
  avg_exit_price: number;
  closed_pnl: number;
  open_fee: number;
  close_fee: number;
  fill_count: number;
  created_time_ms: number;
  updated_time_ms: number;
  order_id: string;
};

export type BybitExecutionRow = {
  execId: string;
  orderId: string;
  symbol: string;
  side: string;
  execPrice: number;
  execQty: number;
  execFee: number;
  execTime: string;
  isMaker: boolean;
};

export async function fetchBybitClosedPnlList(
  apiKey: string,
  apiSecret: string,
  opts: { symbol?: string; limit?: number; startTimeMs?: number; endTimeMs?: number } = {},
  environment: BybitEnvironment = "demo",
): Promise<BybitClosedPnlRow[]> {
  const params: Record<string, string> = {
    category: "linear",
    limit: String(Math.min(100, Math.max(1, opts.limit ?? 50))),
  };
  if (opts.symbol) params.symbol = opts.symbol;
  if (opts.startTimeMs) params.startTime = String(opts.startTimeMs);
  if (opts.endTimeMs) params.endTime = String(opts.endTimeMs);

  const { fetchBybitClosedPnlRaw } = await import("@/lib/bybit-orders");
  const data = await fetchBybitClosedPnlRaw(apiKey, apiSecret, params, environment);
  const list = (data.result as { list?: unknown[] } | undefined)?.list ?? [];
  const out: BybitClosedPnlRow[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const sideRaw = String(r.side ?? "");
    const side: ForwardSide = sideRaw === "Sell" ? "short" : "long";
    const qty = parseFloat(String(r.qty ?? r.closedSize ?? 0));
    const closedPnl = parseFloat(String(r.closedPnl ?? 0));
    const openFee = parseFloat(String(r.openFee ?? 0));
    const closeFee = parseFloat(String(r.closeFee ?? 0));
    const created = parseInt(String(r.createdTime ?? r.updatedTime ?? 0), 10);
    const id =
      String(r.orderId ?? "") +
      "-" +
      String(created) +
      "-" +
      String(qty) +
      "-" +
      side;
    out.push({
      id,
      symbol: String(r.symbol ?? ""),
      side,
      qty: Math.abs(qty),
      leverage: String(r.leverage ?? "1"),
      avg_entry_price: parseFloat(String(r.avgEntryPrice ?? 0)),
      avg_exit_price: parseFloat(String(r.avgExitPrice ?? 0)),
      closed_pnl: closedPnl,
      open_fee: openFee,
      close_fee: closeFee,
      fill_count: parseInt(String(r.fillCount ?? 1), 10),
      created_time_ms: created,
      updated_time_ms: parseInt(String(r.updatedTime ?? created), 10),
      order_id: String(r.orderId ?? ""),
    });
  }
  return out;
}

export function netPnlFromBybitRow(row: BybitClosedPnlRow): number {
  // Bybit `closedPnl` is the authoritative realized figure for this closed slice.
  return Math.round(row.closed_pnl * 100) / 100;
}

export async function waitForRecentClosedPnl(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  opts: { sinceMs: number; side?: ForwardSide; qty?: number },
  environment: BybitEnvironment = "demo",
  attempts = 15,
  delayMs = 400,
): Promise<BybitClosedPnlRow | null> {
  for (let i = 0; i < attempts; i += 1) {
    const rows = await fetchBybitClosedPnlList(
      apiKey,
      apiSecret,
      {
        symbol,
        limit: 20,
        startTimeMs: opts.sinceMs - 60_000,
      },
      environment,
    );
    for (const row of rows) {
      if (row.created_time_ms < opts.sinceMs - 5_000) continue;
      if (opts.side && row.side !== opts.side) continue;
      if (opts.qty != null && Math.abs(row.qty - opts.qty) > opts.qty * 0.15 + 0.001) continue;
      return row;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

export function mapBybitRowToClosedTrade(
  row: BybitClosedPnlRow,
  ctx: {
    position_id?: string;
    strategy_id: string;
    strategy_name: string;
    opened_at?: string;
    exit_reason?: ForwardClosedTrade["exit_reason"];
    reason?: string;
  },
): ForwardClosedTrade {
  const closedIso = new Date(row.created_time_ms).toISOString();
  const openedAt = ctx.opened_at ?? new Date(row.created_time_ms - 60_000).toISOString();
  const opened = new Date(openedAt);
  const holdMin = Math.max(0, (row.created_time_ms - opened.getTime()) / 60_000);
  const gross = row.closed_pnl;
  const net = netPnlFromBybitRow(row);
  return {
    id: ctx.position_id ? `${ctx.position_id}::${row.id}` : `bybit::${row.id}`,
    strategy_id: ctx.strategy_id,
    strategy_name: ctx.strategy_name,
    side: row.side,
    entry_price: row.avg_entry_price,
    exit_price: row.avg_exit_price,
    qty: row.qty,
    gross_pnl_usd: Math.round(gross * 100) / 100,
    net_pnl_usd: net,
    open_fee_usd: Math.round(row.open_fee * 100) / 100,
    close_fee_usd: Math.round(row.close_fee * 100) / 100,
    opened_at: openedAt,
    closed_at: closedIso,
    exit_reason: ctx.exit_reason ?? "manual",
    hold_minutes: Math.round(holdMin * 10) / 10,
    reason: ctx.reason ?? `Bybit closed P&L ${row.order_id}`,
    source: "bybit",
    bybit_closed_pnl_id: row.id,
    bybit_order_id: row.order_id,
    needs_reconcile: false,
  };
}

