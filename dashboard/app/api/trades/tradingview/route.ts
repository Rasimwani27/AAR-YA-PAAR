import { NextResponse } from "next/server";

import { repoRoot } from "@/lib/aar-paths";
import { readForwardState } from "@/lib/forward-test-runner";
import type { ForwardState } from "@/lib/forward-state";
import {
  buildPineScript,
  buildTradesCsv,
  markersFromForward,
  tradingViewChartUrl,
} from "@/lib/tradingview-export";
import { isHostedServer } from "@/lib/hosted-mode";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();
  const intervalMinutes = Number(url.searchParams.get("interval") ?? "3") || 3;
  const symbol = url.searchParams.get("symbol")?.trim() || "BYBIT:BTCUSDT.P";

  if (isHostedServer()) {
    return NextResponse.json({
      ok: false,
      error: "Trade export runs on your local engine (43123). Vercel UI can call that API via NEXT_PUBLIC_AAR_API_URL.",
      chartUrl: tradingViewChartUrl(symbol),
    });
  }

  const state = readForwardState(repoRoot()) as ForwardState | null;
  const history = state?.history ?? [];
  const positions = state?.positions ?? [];
  const markers = markersFromForward(history, positions, { symbol, intervalMinutes });

  if (format === "pine") {
    const body = buildPineScript(markers, { symbol, intervalMinutes });
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": 'attachment; filename="aar-trades.pine"',
      },
    });
  }

  if (format === "csv") {
    const body = buildTradesCsv(markers);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="aar-trades.csv"',
      },
    });
  }

  return NextResponse.json({
    ok: true,
    symbol,
    intervalMinutes,
    chartUrl: tradingViewChartUrl(symbol),
    tradeCount: markers.length,
    markers,
    pineHint: "GET same URL with ?format=pine to download Pine Script for TradingView.",
  });
}
