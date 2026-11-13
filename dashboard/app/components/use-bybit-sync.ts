"use client";

import { useEffect, useRef } from "react";

import { dashboardClientFetch } from "@/lib/api-fetch";
import type { BybitEnvironment } from "@/lib/bybit-environment";
import type { ForwardState } from "@/lib/forward-state";

/** Poll Bybit REST snapshot for one environment (demo or mainnet). */
export function useBybitSync(opts: {
  enabled: boolean;
  environment: BybitEnvironment;
  intervalMs?: number;
  onState: (state: ForwardState) => void;
}) {
  const onStateRef = useRef(opts.onState);
  onStateRef.current = opts.onState;

  useEffect(() => {
    if (!opts.enabled) return;

    const run = async () => {
      try {
        const res = await dashboardClientFetch("/api/bybit/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ environment: opts.environment }),
        });
        const body = await res.json();
        if (body.ok && body.state) {
          onStateRef.current({
            ...(body.state as ForwardState),
            bybit_environment: opts.environment,
            exchange: "bybit",
          });
        }
      } catch {
        /* surfaced via connection test */
      }
    };

    void run();
    const t = setInterval(() => void run(), opts.intervalMs ?? 8_000);
    return () => clearInterval(t);
  }, [opts.enabled, opts.environment, opts.intervalMs]);
}
