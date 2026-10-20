"use client";

import { useMemo, useState } from "react";

import type { DailyPnlRow } from "@/lib/types";
import { usd } from "@/lib/format";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parseUtcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function dayMap(rows: DailyPnlRow[]): Map<string, DailyPnlRow> {
  return new Map(rows.map((r) => [r.date, r]));
}

function monthGrid(year: number, month: number, byDay: Map<string, DailyPnlRow>) {
  const first = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  // Monday = 0 … Sunday = 6
  const startPad = (first.getUTCDay() + 6) % 7;
  const cells: ({ day: number; row?: DailyPnlRow } | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, row: byDay.get(key) });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function dayClass(row?: DailyPnlRow): string {
  if (!row) return "bg-zinc-900/30 text-zinc-700";
  if (row.net_pnl > 0) return "bg-emerald-500/25 text-emerald-100 ring-1 ring-emerald-500/35";
  if (row.net_pnl < 0) return "bg-rose-500/25 text-rose-100 ring-1 ring-rose-500/35";
  return "bg-zinc-700/40 text-zinc-300 ring-1 ring-zinc-600/40";
}

function MonthBlock({
  year,
  month,
  byDay,
}: {
  year: number;
  month: number;
  byDay: Map<string, DailyPnlRow>;
}) {
  const cells = monthGrid(year, month, byDay);
  let monthNet = 0;
  let monthTrades = 0;
  for (let d = 1; d <= 31; d++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const row = byDay.get(key);
    if (row) {
      monthNet += row.net_pnl;
      monthTrades += row.trades;
    }
  }

  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/30 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold text-zinc-300">{MONTHS[month]}</h3>
        {monthTrades > 0 ? (
          <span
            className={`text-[10px] tabular-nums ${
              monthNet > 0 ? "text-emerald-400" : monthNet < 0 ? "text-rose-400" : "text-zinc-500"
            }`}
          >
            {usd(monthNet, true)} · {monthTrades}t
          </span>
        ) : (
          <span className="text-[10px] text-zinc-600">—</span>
        )}
      </div>
      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[9px] text-zinc-600">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w[0]}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, i) =>
          cell === null ? (
            <div key={`e-${i}`} className="aspect-square" />
          ) : (
            <div
              key={`${year}-${month}-${cell.day}`}
              title={
                cell.row
                  ? `${cell.row.date}: ${usd(cell.row.net_pnl)} · ${cell.row.trades} trade(s) · ${cell.row.wins}W/${cell.row.losses}L`
                  : `${year}-${month + 1}-${cell.day}: no trades`
              }
              className={`flex aspect-square items-center justify-center rounded-sm text-[10px] tabular-nums ${dayClass(cell.row)}`}
            >
              {cell.day}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export function PnlCalendar({ daily }: { daily: DailyPnlRow[] }) {
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const r of daily) {
      set.add(parseUtcDate(r.date).getUTCFullYear());
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [daily]);

  const [year, setYear] = useState<number>(() => years[years.length - 1] ?? new Date().getUTCFullYear());

  const byDay = useMemo(() => dayMap(daily), [daily]);

  if (daily.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-6 text-center text-sm text-zinc-500">
        No daily P&amp;L data for this run.
      </div>
    );
  }

  const activeYear = years.includes(year) ? year : years[years.length - 1];

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">P&amp;L calendar</h2>
          <p className="text-xs text-zinc-500">Green = profitable day · red = losing day (UTC exit date)</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="cal-year" className="text-xs text-zinc-500">
            Year
          </label>
          <select
            id="cal-year"
            value={activeYear}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, m) => (
          <MonthBlock key={m} year={activeYear} month={m} byDay={byDay} />
        ))}
      </div>
      <div className="flex flex-wrap gap-4 border-t border-zinc-800/60 px-4 py-2 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-emerald-500/25 ring-1 ring-emerald-500/35" /> Profit day
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-rose-500/25 ring-1 ring-rose-500/35" /> Loss day
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-zinc-900/30" /> No trades
        </span>
      </div>
    </div>
  );
}
