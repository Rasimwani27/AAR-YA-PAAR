"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ManualSizingMode, ManualTradePrefs } from "@/lib/forward-ledger";
import { dashboardClientFetch, formatFetchError, readJsonResponse } from "@/lib/api-fetch";
import type { ForwardExchangePosition, ForwardSide, ForwardState } from "@/lib/forward-state";
import { priceUsd, usd } from "@/lib/format";

const DEFAULT_PREFS: ManualTradePrefs = {
  account_equity_usd: 1000,
  risk_pct_per_trade: 1,
  default_leverage: 10,
  default_stop_usd: 500,
  default_target_usd: 1500,
  sizing_mode: "risk",
  symbol: "BTCUSDT",
};

function previewQty(prefs: ManualTradePrefs, entry: number, stop: number, qtyOverride: string, mode: ManualSizingMode) {
  const stopDist = Math.abs(entry - stop);
  if (stopDist <= 0 || entry <= 0) return null;
  const q = parseFloat(qtyOverride);
  if (Number.isFinite(q) && q > 0) return q;
  if (mode === "qty") return null;
  if (mode === "notional") {
    const notional = prefs.account_equity_usd * (prefs.default_leverage / 10);
    return notional / entry;
  }
  const riskUsd = (prefs.account_equity_usd * prefs.risk_pct_per_trade) / 100;
  return riskUsd / stopDist;
}

export function ManualTradePanel({
  state,
  onState,
  disabled,
  focusPositionId,
  apiKey,
  apiSecret,
}: {
  state: ForwardState | null;
  onState: (s: ForwardState) => void;
  disabled?: boolean;
  focusPositionId?: string | null;
  apiKey?: string;
  apiSecret?: string;
}) {
  const mark = state?.mark_price ?? 0;
  const [prefs, setPrefs] = useState<ManualTradePrefs>(DEFAULT_PREFS);
  const [prefsMsg, setPrefsMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [side, setSide] = useState<ForwardSide>("long");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [qty, setQty] = useState("");
  const [leverage, setLeverage] = useState("");
  const [riskPct, setRiskPct] = useState("");
  const [note, setNote] = useState("");
  const [useUsdStops, setUseUsdStops] = useState(true);
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState("");

  const [editId, setEditId] = useState<string | null>(null);
  const [editStop, setEditStop] = useState("");
  const [editTarget, setEditTarget] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editLev, setEditLev] = useState("");
  const [mainnetKey, setMainnetKey] = useState("");
  const [mainnetSecret, setMainnetSecret] = useState("");
  const [mainnetMsg, setMainnetMsg] = useState("");

  const exchangePositions = useMemo(
    () => (state?.exchange_positions ?? []).filter((p) => !p.error && (p.qty ?? 0) > 0),
    [state?.exchange_positions],
  );

  const [mainnetConn, setMainnetConn] = useState<string>("disconnected");

  const loadPrefs = useCallback(async () => {
    try {
      const res = await dashboardClientFetch("/api/manual-trade");
      const body = await readJsonResponse<{ ok?: boolean; prefs?: ManualTradePrefs }>(res);
      if (body.prefs) {
        setPrefs(body.prefs);
      }
    } catch {
      /* keep defaults */
    }
  }, []);

  useEffect(() => {
    void loadPrefs();
  }, [loadPrefs]);

  const loadMainnetMeta = useCallback(async () => {
    try {
      const res = await dashboardClientFetch("/api/bybit/credentials?environment=mainnet");
      const body = await res.json();
      const status = body.meta?.status as string | undefined;
      if (status) setMainnetConn(status);
    } catch {
      setMainnetConn("connection_error");
    }
  }, []);

  useEffect(() => {
    void loadMainnetMeta();
  }, [loadMainnetMeta]);

  useEffect(() => {
    if (!mark || entry) return;
    setEntry(mark.toFixed(2));
  }, [mark, entry]);

  const post = async (payload: Record<string, unknown>) => {
    setErr("");
    setBusy(true);
    try {
      const res = await dashboardClientFetch("/api/manual-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mark_price: mark || undefined,
          bybit_environment: "mainnet",
          ...payload,
        }),
      });
      const body = await readJsonResponse<{ ok?: boolean; error?: string; state?: ForwardState; prefs?: ManualTradePrefs }>(
        res,
      );
      if (!body.ok) {
        setErr(body.error ?? "Request failed");
        return;
      }
      if (body.prefs) {
        setPrefs(body.prefs);
      }
      if (body.state) onState(body.state);
    } catch (e) {
      setErr(formatFetchError(e, "/api/manual-trade"));
    } finally {
      setBusy(false);
    }
  };

  const savePrefs = () =>
    void post({
      action: "save_prefs",
      ...prefs,
    }).then(() => setPrefsMsg("Risk settings saved."));

  const entryNum = parseFloat(entry) || mark;
  const stopDist = parseFloat(stop) || prefs.default_stop_usd;
  const targetDist = parseFloat(target) || prefs.default_target_usd;
  const stopNum = useUsdStops
    ? side === "long"
      ? entryNum - stopDist
      : entryNum + stopDist
    : parseFloat(stop) || entryNum - prefs.default_stop_usd;
  const targetNum = useUsdStops
    ? side === "long"
      ? entryNum + targetDist
      : entryNum - targetDist
    : parseFloat(target) || entryNum + prefs.default_target_usd;
  let preview: number | null = null;
  let previewErr = "";
  try {
    if (entryNum > 0) {
      preview = previewQty(prefs, entryNum, stopNum, qty, prefs.sizing_mode);
      if (preview != null && preview < 0.001) previewErr = "Quantity below Bybit minimum (0.001 BTC)";
    }
  } catch (e) {
    previewErr = e instanceof Error ? e.message : "Invalid size / stop distance";
  }

  const openTrade = () =>
    void post({
      action: "open",
      order_type: orderType,
      limit_price: orderType === "limit" ? parseFloat(limitPrice) || entryNum : undefined,
      side,
      entry_price: orderType === "market" ? entryNum : undefined,
      stop_price: useUsdStops ? undefined : stopNum,
      target_price: useUsdStops ? undefined : targetNum,
      stop_usd: useUsdStops ? parseFloat(stop) || prefs.default_stop_usd : undefined,
      target_usd: useUsdStops ? parseFloat(target) || prefs.default_target_usd : undefined,
      qty: qty ? parseFloat(qty) : undefined,
      leverage: leverage ? parseFloat(leverage) : prefs.default_leverage,
      risk_pct: riskPct ? parseFloat(riskPct) : prefs.risk_pct_per_trade,
      reason: note,
    });

  const beginEditExchange = (p: ForwardExchangePosition) => {
    setEditId(`${p.symbol}-${p.side}`);
    setEditStop("");
    setEditTarget("");
    setEditQty(String(p.qty ?? ""));
    setEditLev(String(p.leverage ?? prefs.default_leverage));
  };

  const saveExchangeStops = () => {
    if (!editId) return;
    const stopP = parseFloat(editStop);
    const targetP = parseFloat(editTarget);
    void post({
      action: "update_exchange_stops",
      symbol: prefs.symbol,
      stop_price: stopP,
      target_price: targetP,
    }).then(() => setEditId(null));
  };

  const inputClass =
    "w-full rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600";

  const saveMainnetCreds = async () => {
    setMainnetMsg("");
    try {
      const res = await dashboardClientFetch("/api/bybit/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          environment: "mainnet",
          apiKey: mainnetKey.trim(),
          apiSecret: mainnetSecret.trim(),
        }),
      });
      const body = await readJsonResponse<{ ok?: boolean; error?: string; meta?: { status?: string } }>(res);
      setMainnetMsg(body.ok ? "Mainnet credentials saved and verified." : body.error ?? "Save failed");
      if (body.ok) {
        setMainnetSecret("");
        setMainnetConn(body.meta?.status ?? "connected");
      }
    } catch (e) {
      setMainnetMsg(formatFetchError(e, "/api/bybit/credentials"));
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
        <h3 className="text-sm font-semibold text-rose-100">Bybit Mainnet API (Live Trading)</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Separate from Demo Trading keys on the Forward Test panel. Status:{" "}
          <strong className="text-zinc-200">{mainnetConn}</strong>
          {state?.bybit_wallet ? ` · equity ${usd(state.bybit_wallet.equity ?? state.bybit_wallet.totalWalletBalance)}` : ""}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            className={inputClass}
            placeholder="Mainnet API key"
            value={mainnetKey}
            onChange={(e) => setMainnetKey(e.target.value)}
          />
          <input
            className={inputClass}
            type="password"
            placeholder="Mainnet API secret"
            value={mainnetSecret}
            onChange={(e) => setMainnetSecret(e.target.value)}
          />
        </div>
        <button
          type="button"
          disabled={disabled || !mainnetKey.trim() || !mainnetSecret.trim()}
          onClick={() => void saveMainnetCreds()}
          className="mt-2 rounded-lg bg-rose-700 px-3 py-2 text-xs font-medium text-white hover:bg-rose-600 disabled:opacity-40"
        >
          Save &amp; verify Mainnet
        </button>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-zinc-600 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
            onClick={() => void loadMainnetMeta()}
          >
            Refresh status
          </button>
          <button
            type="button"
            disabled={!mainnetKey.trim() && mainnetConn !== "connected"}
            className="rounded-lg border border-sky-600/50 px-3 py-2 text-xs text-sky-200 hover:bg-sky-500/10 disabled:opacity-40"
            onClick={async () => {
              try {
                const res = await dashboardClientFetch("/api/bybit/credentials", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "test", environment: "mainnet" }),
                });
                const body = await res.json();
                setMainnetConn(body.meta?.status ?? (body.ok ? "connected" : "auth_failed"));
                setMainnetMsg(body.ok ? "Mainnet connection verified." : body.error ?? "Test failed");
              } catch (e) {
                setMainnetMsg(formatFetchError(e, "/api/bybit/credentials"));
              }
            }}
          >
            Test connection
          </button>
        </div>
        {mainnetMsg ? <p className="mt-2 text-xs text-zinc-300">{mainnetMsg}</p> : null}
      </section>
      <section className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-4">
        <h3 className="text-sm font-semibold text-violet-100">Risk management (defaults)</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Live Trading · Bybit Mainnet — sizing prefs saved in <code className="text-zinc-400">out/forward/manual_prefs.json</code>. Orders require saved Mainnet API keys.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-xs text-zinc-400">
            Account equity (USDT)
            <input
              type="number"
              className={`mt-1 ${inputClass}`}
              value={prefs.account_equity_usd}
              onChange={(e) => setPrefs((p) => ({ ...p, account_equity_usd: parseFloat(e.target.value) || 0 }))}
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Risk per trade (%)
            <input
              type="number"
              step="0.1"
              className={`mt-1 ${inputClass}`}
              value={prefs.risk_pct_per_trade}
              onChange={(e) => setPrefs((p) => ({ ...p, risk_pct_per_trade: parseFloat(e.target.value) || 0 }))}
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Default leverage
            <input
              type="number"
              className={`mt-1 ${inputClass}`}
              value={prefs.default_leverage}
              onChange={(e) => setPrefs((p) => ({ ...p, default_leverage: parseFloat(e.target.value) || 1 }))}
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Default stop (USD)
            <input
              type="number"
              className={`mt-1 ${inputClass}`}
              value={prefs.default_stop_usd}
              onChange={(e) => setPrefs((p) => ({ ...p, default_stop_usd: parseFloat(e.target.value) || 0 }))}
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Default target (USD)
            <input
              type="number"
              className={`mt-1 ${inputClass}`}
              value={prefs.default_target_usd}
              onChange={(e) => setPrefs((p) => ({ ...p, default_target_usd: parseFloat(e.target.value) || 0 }))}
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Position sizing
            <select
              className={`mt-1 ${inputClass}`}
              value={prefs.sizing_mode}
              onChange={(e) => setPrefs((p) => ({ ...p, sizing_mode: e.target.value as ManualSizingMode }))}
            >
              <option value="risk">Risk % → qty from stop distance</option>
              <option value="qty">Fixed BTC qty (you type qty)</option>
              <option value="notional">Notional from equity × leverage/10</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={savePrefs}
          className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40"
        >
          Save risk settings
        </button>
        {prefsMsg ? <p className="mt-2 text-xs text-emerald-300">{prefsMsg}</p> : null}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
        <h3 className="text-sm font-semibold text-zinc-100">Open manual trade</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-zinc-500">Execution</span>
          <button
            type="button"
            onClick={() => setOrderType("market")}
            className={`rounded-lg px-3 py-1.5 font-semibold ${
              orderType === "market" ? "bg-sky-600 text-white" : "border border-zinc-700 text-zinc-400"
            }`}
          >
            Market
          </button>
          <button
            type="button"
            onClick={() => setOrderType("limit")}
            className={`rounded-lg px-3 py-1.5 font-semibold ${
              orderType === "limit" ? "bg-amber-600 text-white" : "border border-zinc-700 text-zinc-400"
            }`}
          >
            Limit
          </button>
          <span className="text-zinc-500">
            {orderType === "market" ? "Fills immediately at Bybit." : "Rests on the book until fill or cancel."}
          </span>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          {mark ? `Mark ${priceUsd(mark)} · ` : ""}
          Est. qty {preview != null ? preview.toFixed(3) : "—"} BTC
          {preview != null && entryNum ? ` · notional ~${usd(entryNum * preview)}` : ""}
          {orderType === "market" && mark ? ` · est. fill near ${priceUsd(mark)}` : ""}
        </p>
        {previewErr ? <p className="mt-1 text-xs text-rose-300">{previewErr}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {(["long", "short"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase ${
                side === s
                  ? s === "long"
                    ? "bg-emerald-600 text-white"
                    : "bg-rose-600 text-white"
                  : "border border-zinc-700 text-zinc-400"
              }`}
            >
              {s === "long" ? "Buy (Long)" : "Sell (Short)"}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {orderType === "limit" ? (
            <label className="text-xs text-zinc-400">
              Limit price (required)
              <input
                type="number"
                className={`mt-1 ${inputClass}`}
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder={entry || (mark ? mark.toFixed(2) : "")}
              />
            </label>
          ) : (
            <label className="text-xs text-zinc-400">
              Entry (reference; market uses live price)
              <input type="number" className={`mt-1 ${inputClass}`} value={entry} onChange={(e) => setEntry(e.target.value)} />
            </label>
          )}
          <label className="text-xs text-zinc-400">
            Leverage (this trade)
            <input
              type="number"
              className={`mt-1 ${inputClass}`}
              placeholder={String(prefs.default_leverage)}
              value={leverage}
              onChange={(e) => setLeverage(e.target.value)}
            />
          </label>
          <label className="text-xs text-zinc-400">
            <span className="flex items-center gap-2">
              Stop {useUsdStops ? "(USDT distance per BTC)" : "(price)"}
              <button type="button" className="text-violet-300 underline" onClick={() => setUseUsdStops((v) => !v)}>
                switch
              </button>
            </span>
            <input
              type="number"
              className={`mt-1 ${inputClass}`}
              placeholder={useUsdStops ? String(prefs.default_stop_usd) : stopNum.toFixed(2)}
              value={stop}
              onChange={(e) => setStop(e.target.value)}
            />
          </label>
          <label className="text-xs text-zinc-400">
            Target {useUsdStops ? "(USDT distance per BTC)" : "(price)"}
            <input
              type="number"
              className={`mt-1 ${inputClass}`}
              placeholder={useUsdStops ? String(prefs.default_target_usd) : targetNum.toFixed(2)}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
          <label className="text-xs text-zinc-400">
            Risk % (override)
            <input
              type="number"
              step="0.1"
              className={`mt-1 ${inputClass}`}
              placeholder={String(prefs.risk_pct_per_trade)}
              value={riskPct}
              onChange={(e) => setRiskPct(e.target.value)}
            />
          </label>
          <label className="text-xs text-zinc-400">
            BTC qty (optional override)
            <input type="number" step="0.000001" className={`mt-1 ${inputClass}`} value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
        </div>
        <label className="mt-3 block text-xs text-zinc-400">
          Note
          <input type="text" className={`mt-1 ${inputClass}`} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={openTrade}
          className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          {orderType === "limit" ? "Submit limit on Bybit Mainnet" : "Market open on Bybit Mainnet"}
        </button>
      </section>

      {(state?.bybit_open_orders?.length ?? 0) > 0 ? (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h3 className="text-sm font-semibold text-amber-100">Pending Bybit orders</h3>
          <ul className="mt-2 space-y-2 text-xs">
            {state!.bybit_open_orders!.map((o) => (
              <li key={o.orderId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-950/60 px-3 py-2">
                <span>
                  {o.orderType} {o.side} {o.qty} @ {priceUsd(o.price)} · <strong>{o.status}</strong>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded border border-zinc-600 px-2 py-1 text-rose-200 hover:bg-rose-500/10"
                  onClick={() => void post({ action: "cancel_order", order_id: o.orderId, symbol: o.symbol })}
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {exchangePositions.length > 0 ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h3 className="text-sm font-semibold text-zinc-100">Bybit positions — SL / TP</h3>
          <ul className="mt-3 space-y-3">
            {exchangePositions.map((p) => {
              const key = `${p.symbol}-${p.side}`;
              return (
                <li key={key} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium uppercase text-zinc-300">{p.side}</span>
                    <span className="tabular-nums text-zinc-400">
                      {p.qty} BTC · {p.leverage ?? 1}x · uPnL {usd(p.unrealized_pnl ?? 0)}
                    </span>
                  </div>
                  <p className="mt-1 tabular-nums text-zinc-200">
                    Entry {priceUsd(p.entry_price ?? 0)} · Mark {priceUsd(p.mark_price ?? 0)}
                  </p>
                  {editId === key ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <input className={inputClass} value={editStop} onChange={(e) => setEditStop(e.target.value)} placeholder="Stop loss price" />
                      <input className={inputClass} value={editTarget} onChange={(e) => setEditTarget(e.target.value)} placeholder="Take profit price" />
                      <button type="button" className="rounded-lg bg-violet-600 px-3 py-2 text-xs text-white" onClick={saveExchangeStops}>
                        Push SL/TP to Bybit
                      </button>
                      <button type="button" className="rounded-lg border border-zinc-600 px-3 py-2 text-xs" onClick={() => setEditId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="mt-3 rounded-lg border border-zinc-600 px-3 py-1.5 text-xs hover:bg-zinc-800"
                      onClick={() => beginEditExchange(p)}
                    >
                      Set stop-loss / take-profit on exchange
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {err ? (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{err}</p>
      ) : null}
      {disabled ? (
        <p className="text-xs text-amber-200/90">Run the dashboard locally (START-HERE-43123.bat) and save Bybit Mainnet API keys to place live orders.</p>
      ) : null}
    </div>
  );
}
