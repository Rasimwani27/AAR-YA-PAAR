import { PnlCell } from "@/app/components/metric-card";
import type { BacktestReport } from "@/lib/types";
import { pct, usd } from "@/lib/format";

export function ResultsTable({ report }: { report: BacktestReport }) {
  const { rows, summary } = report;
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm">
      <div className="border-b border-zinc-800/80 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-200">Year-by-year performance</h2>
        <p className="text-xs text-zinc-500">
          {report.meta.start} → {report.meta.end} · {report.meta.symbol}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800/60 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">Year</th>
              <th className="px-4 py-3 font-medium text-right">Trades</th>
              <th className="px-4 py-3 font-medium text-right">W / L</th>
              <th className="px-4 py-3 font-medium text-right">Win %</th>
              <th className="px-4 py-3 font-medium text-right">Gross</th>
              <th className="px-4 py-3 font-medium text-right">Fees</th>
              <th className="px-4 py-3 font-medium text-right">Net</th>
              <th className="px-4 py-3 font-medium text-right">Return</th>
              <th className="px-4 py-3 font-medium text-right">Equity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {rows.map((r) => (
              <tr key={r.year} className="text-zinc-300 hover:bg-zinc-800/30">
                <td className="px-4 py-3 font-medium text-zinc-100">{r.year}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.trades}</td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-400">
                  {r.wins} / {r.losses}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{r.win_pct.toFixed(1)}%</td>
                <td className="px-4 py-3 text-right">
                  <PnlCell value={r.gross} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-500">{usd(r.fees)}</td>
                <td className="px-4 py-3 text-right">
                  <PnlCell value={r.net} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{pct(r.return_pct)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-zinc-100">
                  {usd(r.equity_end)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-700 bg-zinc-950/50 font-semibold text-zinc-100">
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3 text-right tabular-nums">{summary.trades}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {summary.wins} / {summary.losses}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{summary.win_pct.toFixed(1)}%</td>
              <td className="px-4 py-3 text-right">
                <PnlCell value={summary.gross} />
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-zinc-500">{usd(summary.fees)}</td>
              <td className="px-4 py-3 text-right">
                <PnlCell value={summary.net} />
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{pct(summary.roi_pct, 0)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{usd(summary.final_equity)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
