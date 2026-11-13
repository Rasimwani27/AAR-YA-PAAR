"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { ForwardClosedTrade, ForwardPosition } from "@/lib/forward-state";
import { buildPineScript, markersFromForward, tradingViewChartUrlForTime } from "@/lib/tradingview-export";
import { apiFetch } from "@/lib/api-fetch";

declare global {
  interface Window {
    TradingView?: {
      widget: new (cfg: Record<string, unknown>) => void;
    };
  }
}

const TV_SYMBOL = "BYBIT:BTCUSDT.P";

export function TradingViewPanel({
  history,
  positions,
}: {
  history: ForwardClosedTrade[];
  positions: ForwardPosition[];
}) {
  const containerId = useId().replace(/:/g, "");
  const hostRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const markers = markersFromForward(history, positions);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    el.innerHTML = "";
    const inner = document.createElement("div");
    inner.id = containerId;
    inner.className = "h-full w-full";
    el.appendChild(inner);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => {
      if (!window.TradingView) return;
      new window.TradingView.widget({
        autosize: true,
        symbol: TV_SYMBOL,
        interval: "3",
        timezone: "Asia/Kolkata",
        theme: "dark",
        style: "1",
        locale: "en",
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_legend: false,
        container_id: containerId,
      });
    };
    script.onerror = () => setError("Could not load TradingView embed (network or blocker).");
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, [containerId]);

  const copyPine = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch("/api/trades/tradingview?format=pine");
      const text = await res.text();
      if (!res.ok) throw new Error(text.slice(0, 200));
      await navigator.clipboard.writeText(text);
    } catch {
      const fallback = buildPineScript(markers);
      await navigator.clipboard.writeText(fallback);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }, [markers]);

  const downloadPine = useCallback(() => {
    window.open("/api/trades/tradingview?format=pine", "_blank", "noopener,noreferrer");
  }, []);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/40">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">TradingView chart</h2>
            <p className="text-xs text-zinc-500">
              Bybit BTCUSDT linear perp (3m). Use Pine export to overlay entry/exit markers (same symbol).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyPine}
              className="rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700"
            >
              {copied ? "Pine copied" : "Copy Pine markers"}
            </button>
            <button
              type="button"
              onClick={downloadPine}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Download .pine
            </button>
            <a
              href="https://www.tradingview.com/chart/?symbol=BYBIT%3ABTCUSDT.P&interval=3"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-sky-800/60 bg-sky-950/40 px-3 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-900/40"
            >
              Open full TradingView
            </a>
          </div>
        </div>
        <div ref={hostRef} className="h-[420px] w-full bg-zinc-950" />
        {error ? <p className="px-4 py-2 text-xs text-amber-400">{error}</p> : null}
      </section>

      <section className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3 text-xs text-zinc-400">
        <p className="font-medium text-zinc-300">Add markers on TradingView (one-time per export)</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Copy or download Pine above.</li>
          <li>On TradingView: Pine Editor → New → paste → Save → Add to chart.</li>
          <li>Same symbol: <span className="text-zinc-200">{TV_SYMBOL}</span>, interval 3m (IST timezone optional).</li>
          <li>Re-export after new closes — TradingView has no live API from Cursor; refresh Pine when trades update.</li>
        </ol>
      </section>

      {markers.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/40">
          <div className="border-b border-zinc-800/80 px-4 py-2 text-xs font-medium text-zinc-400">
            Jump to trade on TradingView
          </div>
          <ul className="max-h-48 divide-y divide-zinc-800/50 overflow-y-auto text-xs">
            {markers.slice(0, 25).map((m, i) => (
              <li key={`${m.entryMs}-${i}`} className="flex items-center justify-between gap-2 px-4 py-2">
                <span className="text-zinc-400">
                  {m.strategyId} · {m.side}
                  {m.open ? " (open)" : ""}
                </span>
                <a
                  href={tradingViewChartUrlForTime(new Date(m.entryMs).toISOString())}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-sky-400 hover:underline"
                >
                  {new Date(m.entryMs).toLocaleString()}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-center text-sm text-zinc-500">No trades yet — markers appear after forward test opens or closes positions.</p>
      )}
    </div>
  );
}
