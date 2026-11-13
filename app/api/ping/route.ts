import { NextResponse } from "next/server";

/** Shown when Next dev runs from repo root — not the backtest dashboard. */
export async function GET() {
  return NextResponse.json({
    ok: false,
    service: "vercel-root-shell",
    hint: "Start the lab from dashboard/: START-HERE.bat (3000) or START-HERE-43123.bat (43123).",
  });
}
