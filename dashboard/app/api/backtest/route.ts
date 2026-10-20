import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Backtests were removed from the dashboard. Run on your PC: PYTHONPATH=. python3 -m aar backtest --config config.btc.london-mid-engulf-winner.toml",
    },
    { status: 410 },
  );
}

export async function POST() {
  return GET();
}
