"use client";

import { useEffect, useRef } from "react";

import type { BybitEnvironment } from "@/lib/bybit-environment";
import type { ForwardState } from "@/lib/forward-state";
import { mapPositionsToExchange } from "@/lib/bybit-sync";

type BybitStreamOptions = {
  enabled: boolean;
  environment: BybitEnvironment;
  onStatePatch: (patch: Partial<ForwardState>) => void;
};

/** Subscribes to local SSE proxy of Bybit public ticker + private position streams. */
export function useBybitStream({ enabled, environment, onStatePatch }: BybitStreamOptions) {
  const patchRef = useRef(onStatePatch);
  patchRef.current = onStatePatch;

  useEffect(() => {
    if (!enabled) return;
    let es: EventSource | null = null;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      es = new EventSource(`/api/bybit/stream?environment=${encodeURIComponent(environment)}`);
      es.addEventListener("ticker", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as { mark_price?: number };
          if (data.mark_price && data.mark_price > 0) {
            patchRef.current({ mark_price: data.mark_price, updated_at: new Date().toISOString() });
          }
        } catch {
          /* ignore */
        }
      });
      es.addEventListener("position", (ev) => {
        try {
          const raw = JSON.parse((ev as MessageEvent).data) as unknown;
          const rows = Array.isArray(raw) ? raw : [raw];
          const mapped = rows
            .filter((r) => r && typeof r === "object")
            .map((r) => {
              const row = r as Record<string, unknown>;
              const sz = parseFloat(String(row.size ?? 0));
              if (Math.abs(sz) < 1e-12) return null;
              return {
                symbol: String(row.symbol ?? ""),
                side: String(row.side) === "Buy" ? ("long" as const) : ("short" as const),
                qty: Math.abs(sz),
                entry_price: parseFloat(String(row.avgPrice ?? 0)),
                mark_price: parseFloat(String(row.markPrice ?? row.lastPrice ?? 0)),
                unrealized_pnl: parseFloat(String(row.unrealisedPnl ?? row.unrealizedPnl ?? 0)),
                leverage: String(row.leverage ?? "1"),
                liquidation_price: parseFloat(String(row.liqPrice ?? 0)) || undefined,
              };
            })
            .filter(Boolean) as NonNullable<ForwardState["exchange_positions"]>;
          const exchange_positions = mapPositionsToExchange(
            mapped.map((m) => ({
              symbol: m!.symbol ?? "",
              side: m!.side ?? "long",
              qty: m!.qty ?? 0,
              entry_price: m!.entry_price ?? 0,
              mark_price: m!.mark_price ?? 0,
              unrealized_pnl: m!.unrealized_pnl ?? 0,
              leverage: m!.leverage ?? "1",
              liquidation_price: m!.liquidation_price,
            })),
          );
          const unrealized = exchange_positions.reduce((s, p) => s + (p.unrealized_pnl ?? 0), 0);
          patchRef.current({
            exchange_positions,
            exchange_stats: {
              unrealized_usd: Math.round(unrealized * 100) / 100,
              position_count: exchange_positions.length,
            },
            bybit_environment: environment,
            updated_at: new Date().toISOString(),
          });
        } catch {
          /* ignore */
        }
      });
      es.onerror = () => {
        es?.close();
        if (!cancelled) setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [enabled, environment]);
}
