import { NextResponse } from "next/server";

import { assertTradingLocal, repoRoot } from "@/lib/aar-paths";
import { waitForRecentClosedPnl } from "@/lib/bybit-closed-pnl";
import { resolveBybitCredentials } from "@/lib/bybit-credentials";
import { type BybitEnvironment, parseBybitEnvironment } from "@/lib/bybit-environment";
import {
  bybitCancelOrder,
  bybitLimitOpen,
  bybitMarketCloseVerified,
  bybitMarketOpen,
  bybitUpdateStops,
  fetchBybitWallet,
  findBybitPosition,
  pollOrderStatus,
  syncBybitSnapshot,
} from "@/lib/bybit-orders";
import { mergeBybitSnapshot } from "@/lib/bybit-sync";
import {
  closeManualPosition,
  computeManualTradeLegs,
  DEFAULT_MANUAL_PREFS,
  enrichForwardStateFromLedger,
  fetchBtcMarkPrice,
  getManualPosition,
  loadManualPrefs,
  mergeExchangeIntoState,
  openManualPosition,
  partialCloseManualPosition,
  refreshForwardStateFile,
  resolveMarkPrice,
  saveManualPrefs,
  type ManualSizingMode,
  type ManualTradePrefs,
  updateManualPosition,
} from "@/lib/forward-ledger";
import type { ForwardSide } from "@/lib/forward-state";
import { isHostedServer } from "@/lib/hosted-mode";

export const runtime = "nodejs";

async function resolveMark(root: string, mark?: number, entryFallback?: number) {
  if (mark != null && mark > 0) return mark;
  if (entryFallback != null && entryFallback > 0) return entryFallback;
  try {
    return await fetchBtcMarkPrice();
  } catch {
    return resolveMarkPrice(root);
  }
}

async function syncStateAfterBybit(
  root: string,
  state: Awaited<ReturnType<typeof refreshForwardStateFile>>["state"],
  apiKey: string,
  apiSecret: string,
  environment: BybitEnvironment,
) {
  const snapshot = await syncBybitSnapshot(apiKey, apiSecret, undefined, environment);
  return mergeBybitSnapshot(state, { ...snapshot, environment });
}

export async function GET() {
  if (isHostedServer()) {
    return NextResponse.json({
      ok: true,
      hosted: true,
      prefs: DEFAULT_MANUAL_PREFS,
      message: "Live trading requires the local dashboard and saved Bybit Mainnet API keys.",
    });
  }
  const engineErr = assertTradingLocal(repoRoot());
  if (engineErr) {
    return NextResponse.json({ ok: false, error: engineErr }, { status: 503 });
  }
  const root = repoRoot();
  const prefs = loadManualPrefs(root);
  return NextResponse.json({ ok: true, prefs });
}

export async function POST(req: Request) {
  if (isHostedServer()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Manual trades are local-only. Run START-HERE-43123.bat on your PC.",
      },
      { status: 503 },
    );
  }
  if (process.env.AAR_DISABLE_EXEC === "1") {
    return NextResponse.json({ ok: false, error: "Exec disabled" }, { status: 503 });
  }
  const root = repoRoot();
  const engineErr = assertTradingLocal(root);
  if (engineErr) {
    return NextResponse.json({ ok: false, error: engineErr }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const action = String(body.action ?? "");

  try {
    if (action === "save_prefs") {
      const prefs: ManualTradePrefs = {
        account_equity_usd: Number(body.account_equity_usd ?? DEFAULT_MANUAL_PREFS.account_equity_usd),
        risk_pct_per_trade: Number(body.risk_pct_per_trade ?? DEFAULT_MANUAL_PREFS.risk_pct_per_trade),
        default_leverage: Number(body.default_leverage ?? DEFAULT_MANUAL_PREFS.default_leverage),
        default_stop_usd: Number(body.default_stop_usd ?? DEFAULT_MANUAL_PREFS.default_stop_usd),
        default_target_usd: Number(body.default_target_usd ?? DEFAULT_MANUAL_PREFS.default_target_usd),
        sizing_mode: (body.sizing_mode as ManualSizingMode) ?? DEFAULT_MANUAL_PREFS.sizing_mode,
        symbol: String(body.symbol ?? DEFAULT_MANUAL_PREFS.symbol),
      };
      const saved = saveManualPrefs(root, prefs);
      return NextResponse.json({ ok: true, prefs: saved });
    }

    const entryFallback = body.entry_price != null ? Number(body.entry_price) : undefined;
    const environment = parseBybitEnvironment(body.bybit_environment, "mainnet");
    const creds = resolveBybitCredentials(root, environment, {
      apiKey: String(body.apiKey ?? ""),
      apiSecret: String(body.apiSecret ?? ""),
    });
    const prefs = loadManualPrefs(root);
    const requireCreds = action !== "refresh" && action !== "save_prefs";
    if (requireCreds && !creds) {
      return NextResponse.json(
        {
          ok: false,
          error: `Bybit ${environment} API credentials required. Save keys under Live Trading (Mainnet) or Forward Test (Demo).`,
        },
        { status: 400 },
      );
    }

    const mark = await resolveMark(
      root,
      body.mark_price != null ? Number(body.mark_price) : undefined,
      entryFallback,
    );

    if (action === "refresh") {
      const out = refreshForwardStateFile(root, mark);
      let state = out.state;
      if (creds) {
        state = await syncStateAfterBybit(root, state, creds.apiKey, creds.apiSecret, creds.environment);
      }
      return NextResponse.json({ ok: true, state, mark_price: mark });
    }

    if (action === "update_exchange_stops") {
      const symbol = String(body.symbol ?? prefs.symbol);
      const stopPrice = Number(body.stop_price);
      const targetPrice = Number(body.target_price);
      if (!Number.isFinite(stopPrice) || !Number.isFinite(targetPrice) || stopPrice <= 0 || targetPrice <= 0) {
        return NextResponse.json({ ok: false, error: "Valid stop_price and target_price required" }, { status: 400 });
      }
      await bybitUpdateStops(
        creds!.apiKey,
        creds!.apiSecret,
        { symbol, stopPrice, targetPrice },
        creds!.environment,
      );
      let state = refreshForwardStateFile(root, mark).state;
      state = await syncStateAfterBybit(root, state, creds!.apiKey, creds!.apiSecret, creds!.environment);
      return NextResponse.json({ ok: true, state, mark_price: mark });
    }

    if (action === "cancel_order") {
      if (!creds) {
        return NextResponse.json({ ok: false, error: "Bybit credentials required" }, { status: 400 });
      }
      const orderId = String(body.order_id ?? "");
      const symbol = String(body.symbol ?? prefs.symbol);
      if (!orderId) {
        return NextResponse.json({ ok: false, error: "order_id required" }, { status: 400 });
      }
      await bybitCancelOrder(creds.apiKey, creds.apiSecret, symbol, orderId, creds.environment);
      let base = refreshForwardStateFile(root, mark).state;
      base = await syncStateAfterBybit(root, base, creds.apiKey, creds.apiSecret, creds.environment);
      return NextResponse.json({ ok: true, state: base, mark_price: mark });
    }

    if (action === "close_exchange") {
      if (!creds) {
        return NextResponse.json({ ok: false, error: "Bybit credentials required" }, { status: 400 });
      }
      const symbol = String(body.symbol ?? prefs.symbol);
      const side = body.side as ForwardSide;
      if (side !== "long" && side !== "short") {
        return NextResponse.json({ ok: false, error: "side required" }, { status: 400 });
      }
      const exPos = await findBybitPosition(creds.apiKey, creds.apiSecret, symbol, side, creds.environment);
      if (!exPos) {
        return NextResponse.json({ ok: false, error: `No ${side} position on Bybit for ${symbol}` }, { status: 400 });
      }
      const closeQty =
        body.close_qty != null ? Math.min(Number(body.close_qty), exPos.qty) : exPos.qty;
      const closeStarted = Date.now();
      const closed = await bybitMarketCloseVerified(
        creds.apiKey,
        creds.apiSecret,
        { symbol, side, qty: closeQty },
        creds.environment,
      );
      const pnlRow = await waitForRecentClosedPnl(
        creds.apiKey,
        creds.apiSecret,
        symbol,
        { sinceMs: closeStarted - 3_000, side, qty: closed.closedQty },
        creds.environment,
      );
      let base = refreshForwardStateFile(root, mark).state;
      base = await syncStateAfterBybit(root, base, creds.apiKey, creds.apiSecret, creds.environment);
      const positionId = String(body.position_id ?? "");
      if (positionId) {
        try {
          if (closed.remainingQty < 1e-8) {
            base = closeManualPosition(root, positionId, mark, pnlRow?.avg_exit_price, pnlRow, "manual").state;
            base = await syncStateAfterBybit(root, base, creds.apiKey, creds.apiSecret, creds.environment);
          } else if (closeQty < exPos.qty) {
            base = partialCloseManualPosition(
              root,
              positionId,
              closed.closedQty,
              mark,
              pnlRow?.avg_exit_price ?? exPos.mark_price,
              pnlRow,
            ).state;
            base = await syncStateAfterBybit(root, base, creds.apiKey, creds.apiSecret, creds.environment);
          }
        } catch {
          /* paper row may not exist */
        }
      }
      return NextResponse.json({ ok: true, state: base, mark_price: mark, bybit_close: closed });
    }

    if (action === "open") {
      const side = body.side as ForwardSide;
      if (side !== "long" && side !== "short") {
        return NextResponse.json({ ok: false, error: "side must be long or short" }, { status: 400 });
      }
      const orderType = String(body.order_type ?? "market").toLowerCase();
      if (orderType !== "market" && orderType !== "limit") {
        return NextResponse.json({ ok: false, error: "order_type must be market or limit" }, { status: 400 });
      }
      const limitPrice = body.limit_price != null ? Number(body.limit_price) : undefined;
      if (orderType === "limit" && (!limitPrice || limitPrice <= 0)) {
        return NextResponse.json({ ok: false, error: "limit_price required for limit orders" }, { status: 400 });
      }
      const openInput = {
        side,
        entry_price: orderType === "limit" ? limitPrice : entryFallback,
        stop_price: body.stop_price != null ? Number(body.stop_price) : undefined,
        target_price: body.target_price != null ? Number(body.target_price) : undefined,
        stop_usd: body.stop_usd != null ? Number(body.stop_usd) : undefined,
        target_usd: body.target_usd != null ? Number(body.target_usd) : undefined,
        qty: body.qty != null ? Number(body.qty) : undefined,
        notional_usd: body.notional_usd != null ? Number(body.notional_usd) : undefined,
        leverage: body.leverage != null ? Number(body.leverage) : undefined,
        risk_pct: body.risk_pct != null ? Number(body.risk_pct) : undefined,
        reason: body.reason != null ? String(body.reason) : undefined,
      };
      let bybitExtra: { bybit_order_id?: string; bybit_live?: boolean; entry_fill?: number } | undefined;
      let pendingLimit = false;

      const wallet = await fetchBybitWallet(creds!.apiKey, creds!.apiSecret, creds!.environment);
      const legs = computeManualTradeLegs(
        root,
        { ...openInput, entry_price: openInput.entry_price ?? mark },
        mark,
        wallet.equity > 0 ? wallet.equity : undefined,
      );
      if (orderType === "market") {
        const placed = await bybitMarketOpen(
          creds!.apiKey,
          creds!.apiSecret,
          {
            symbol: legs.symbol,
            side: openInput.side,
            qty: legs.qty,
            stopPrice: legs.stopPrice,
            targetPrice: legs.targetPrice,
            leverage: legs.leverage,
          },
          creds!.environment,
        );
        if (placed.orderStatus === "Rejected") {
          return NextResponse.json({ ok: false, error: "Bybit rejected market order" }, { status: 400 });
        }
        const ex = await findBybitPosition(
          creds!.apiKey,
          creds!.apiSecret,
          legs.symbol,
          openInput.side,
          creds!.environment,
        );
        bybitExtra = {
          bybit_order_id: placed.orderId,
          bybit_live: true,
          entry_fill: placed.avgPrice ?? ex?.entry_price ?? legs.entry,
        };
      } else {
        const placed = await bybitLimitOpen(
          creds!.apiKey,
          creds!.apiSecret,
          {
            symbol: legs.symbol,
            side: openInput.side,
            qty: legs.qty,
            limitPrice: limitPrice!,
            stopPrice: legs.stopPrice,
            targetPrice: legs.targetPrice,
            leverage: legs.leverage,
          },
          creds!.environment,
        );
        pendingLimit = true;
        bybitExtra = { bybit_order_id: placed.orderId, bybit_live: true };
      }

      let state: Awaited<ReturnType<typeof refreshForwardStateFile>>["state"] | undefined;
      if (!pendingLimit) {
        const out = openManualPosition(root, openInput, mark, bybitExtra);
        state = out.state;
      } else {
        state = (await enrichForwardStateFromLedger(root, refreshForwardStateFile(root, mark).state));
      }

      state = await syncStateAfterBybit(root, state, creds!.apiKey, creds!.apiSecret, creds!.environment);
      return NextResponse.json({
        ok: true,
        state,
        mark_price: mark,
        bybit_live: Boolean(bybitExtra?.bybit_live),
        pending_limit: pendingLimit,
        bybit_order_id: bybitExtra?.bybit_order_id,
      });
    }

    if (action === "update") {
      const positionId = String(body.position_id ?? "");
      if (!positionId) {
        return NextResponse.json({ ok: false, error: "position_id required" }, { status: 400 });
      }
      const before = getManualPosition(root, positionId);
      const upd = {
        position_id: positionId,
        stop_price: body.stop_price != null ? Number(body.stop_price) : undefined,
        target_price: body.target_price != null ? Number(body.target_price) : undefined,
        qty: body.qty != null ? Number(body.qty) : undefined,
        leverage: body.leverage != null ? Number(body.leverage) : undefined,
        risk_pct: body.risk_pct != null ? Number(body.risk_pct) : undefined,
        reason: body.reason != null ? String(body.reason) : undefined,
      };
      const prefsSym = loadManualPrefs(root).symbol;
      const stopP = upd.stop_price ?? before.stop_price;
      const targetP = upd.target_price ?? before.target_price;
      await bybitUpdateStops(
        creds!.apiKey,
        creds!.apiSecret,
        { symbol: prefsSym, stopPrice: stopP, targetPrice: targetP },
        creds!.environment,
      );
      const out = updateManualPosition(root, upd, mark);
      let state = await syncStateAfterBybit(root, out.state, creds!.apiKey, creds!.apiSecret, creds!.environment);
      return NextResponse.json({ ok: true, state, mark_price: mark });
    }

    if (action === "close") {
      const positionId = String(body.position_id ?? "");
      if (!positionId) {
        return NextResponse.json({ ok: false, error: "position_id required" }, { status: 400 });
      }
      const before = getManualPosition(root, positionId);
      const symbol = loadManualPrefs(root).symbol;
      const closeQty = body.close_qty != null ? Number(body.close_qty) : before.qty;

      const exPos = await findBybitPosition(
        creds!.apiKey,
        creds!.apiSecret,
        symbol,
        before.side,
        creds!.environment,
      );
      if (!exPos) {
        return NextResponse.json(
          { ok: false, error: "No open position on Bybit for this symbol/side — sync first." },
          { status: 400 },
        );
      }
      const closeStarted = Date.now();
      const closed = await bybitMarketCloseVerified(
        creds!.apiKey,
        creds!.apiSecret,
        { symbol, side: before.side, qty: closeQty },
        creds!.environment,
      );
      const pnlRow = await waitForRecentClosedPnl(
        creds!.apiKey,
        creds!.apiSecret,
        symbol,
        { sinceMs: closeStarted - 3_000, side: before.side, qty: closed.closedQty },
        creds!.environment,
      );
      if (!pnlRow) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Bybit accepted the close but closed P&L is not available yet. Sync again in a few seconds.",
          },
          { status: 400 },
        );
      }
      let out;
      if (closed.remainingQty < 1e-8) {
        out = closeManualPosition(root, positionId, mark, pnlRow.avg_exit_price, pnlRow, "manual");
      } else {
        out = partialCloseManualPosition(
          root,
          positionId,
          closed.closedQty,
          mark,
          pnlRow.avg_exit_price ?? exPos.mark_price,
          pnlRow,
        );
      }
      const state = await syncStateAfterBybit(root, out.state, creds!.apiKey, creds!.apiSecret, creds!.environment);
      return NextResponse.json({ ok: true, state, mark_price: mark, bybit_close: closed });
    }

  // Limit order fill polling
    if (action === "poll_order") {
      if (!creds) {
        return NextResponse.json({ ok: false, error: "Bybit credentials required" }, { status: 400 });
      }
      const orderId = String(body.order_id ?? "");
      const symbol = String(body.symbol ?? prefs.symbol);
      if (!orderId) {
        return NextResponse.json({ ok: false, error: "order_id required" }, { status: 400 });
      }
      const polled = await pollOrderStatus(
        creds.apiKey,
        creds.apiSecret,
        symbol,
        orderId,
        1,
        0,
        creds.environment,
      );
      let state = refreshForwardStateFile(root, mark).state;
      state = await syncStateAfterBybit(root, state, creds.apiKey, creds.apiSecret, creds.environment);
      return NextResponse.json({ ok: true, state, order: polled });
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Manual trade failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
