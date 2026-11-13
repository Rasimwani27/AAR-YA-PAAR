import { fetchBybitClosedPnlList, mapBybitRowToClosedTrade } from "@/lib/bybit-closed-pnl";
import { tradeRealizedUsd } from "@/lib/trade-realized-pnl";
import type { BybitEnvironment } from "@/lib/bybit-environment";
import type { BybitPositionRow } from "@/lib/bybit-orders";
import {
  closeManualPositionWithBybit,
  loadLedgerSnapshot,
  saveLedgerSnapshot,
  type RawLedger,
} from "@/lib/forward-ledger";

function livePositionKey(symbol: string, side: string) {
  return `${symbol.toUpperCase()}:${side}`;
}

/** Merge Bybit closed-P&L into ledger; fix paper estimates that disagree. */
export async function reconcileLedgerWithBybit(
  root: string,
  apiKey: string,
  apiSecret: string,
  opts: { symbol: string; exchangePositions: BybitPositionRow[]; environment?: BybitEnvironment },
): Promise<RawLedger> {
  const environment = opts.environment ?? "demo";
  const ledger = loadLedgerSnapshot(root);
  const sinceMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const rows = await fetchBybitClosedPnlList(
    apiKey,
    apiSecret,
    {
      symbol: opts.symbol,
      limit: 100,
      startTimeMs: sinceMs,
    },
    environment,
  );

  const liveKeys = new Set(
    opts.exchangePositions.map((p) => livePositionKey(String(p.symbol), p.side)),
  );

  for (const pos of [...ledger.positions]) {
    if (!pos.bybit_live) continue;
    const key = livePositionKey(opts.symbol, pos.side);
    if (!liveKeys.has(key)) {
      const row = rows.find(
        (r) =>
          r.side === pos.side &&
          r.created_time_ms >= new Date(pos.opened_at).getTime() - 60_000 &&
          Math.abs(r.qty - pos.qty) < Math.max(0.002, pos.qty * 0.2),
      );
      if (row) {
        closeManualPositionWithBybit(root, pos.id, row, { exit_reason: "exchange" });
      }
    }
  }

  const ledger2 = loadLedgerSnapshot(root);
  const known = new Set(ledger2.history.map((h) => h.bybit_closed_pnl_id).filter(Boolean));

  for (const row of rows) {
    if (known.has(row.id)) continue;

    const paperIdx = ledger2.history.findIndex(
      (h) =>
        !h.bybit_closed_pnl_id &&
        h.side === row.side &&
        Math.abs(h.qty - row.qty) < Math.max(0.002, row.qty * 0.15) &&
        Math.abs(new Date(h.closed_at).getTime() - row.created_time_ms) < 180_000,
    );

    if (paperIdx >= 0) {
      const old = ledger2.history[paperIdx]!;
      const trade = mapBybitRowToClosedTrade(row, {
        position_id: old.id.split("::")[0],
        strategy_id: old.strategy_id,
        strategy_name: old.strategy_name,
        opened_at: old.opened_at,
        exit_reason: old.exit_reason === "manual" ? "manual" : "exchange",
        reason: `Bybit closed P&L (replaced paper estimate ${old.gross_pnl_usd})`,
      });
      trade.id = old.id.includes("::") ? old.id : `${old.id}::${row.id}`;
      ledger2.history[paperIdx] = trade;
      known.add(row.id);
      continue;
    }

    const orphan = mapBybitRowToClosedTrade(row, {
      strategy_id: "bybit-exchange",
      strategy_name: "Bybit (exchange)",
      exit_reason: "exchange",
      reason: "Imported from Bybit closed P&L",
    });
    ledger2.history.unshift(orphan);
    known.add(row.id);
  }

  for (const h of ledger2.history) {
    if (h.bybit_closed_pnl_id || h.source === "bybit") {
      h.needs_reconcile = false;
      continue;
    }
    const near = rows.find(
      (r) =>
        r.side === h.side &&
        Math.abs(r.qty - h.qty) < Math.max(0.002, h.qty * 0.2) &&
        Math.abs(new Date(h.closed_at).getTime() - r.created_time_ms) < 300_000,
    );
    if (
      near &&
      Math.abs(
        tradeRealizedUsd(h) -
          tradeRealizedUsd(
            mapBybitRowToClosedTrade(near, {
              strategy_id: h.strategy_id,
              strategy_name: h.strategy_name,
            }),
          ),
      ) > 0.5
    ) {
      h.needs_reconcile = true;
    }
  }

  ledger2.history = ledger2.history.slice(0, 500);
  saveLedgerSnapshot(root, ledger2);
  return ledger2;
}
