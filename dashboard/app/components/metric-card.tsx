import { pct, pnlClass, usd } from "@/lib/format";

type Props = {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "profit" | "loss";
};

export function MetricCard({ label, value, sub, tone = "neutral" }: Props) {
  const toneClass =
    tone === "profit" ? "text-emerald-400" : tone === "loss" ? "text-rose-400" : "text-zinc-100";
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 shadow-sm backdrop-blur">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-zinc-500">{sub}</p> : null}
    </div>
  );
}

export function metricFromNet(net: number, label = "Net P&L") {
  return (
    <MetricCard
      label={label}
      value={usd(net)}
      tone={net > 0 ? "profit" : net < 0 ? "loss" : "neutral"}
    />
  );
}

export function metricFromPct(n: number, label: string) {
  return (
    <MetricCard
      label={label}
      value={pct(n)}
      tone={n > 0 ? "profit" : n < 0 ? "loss" : "neutral"}
    />
  );
}

export function PnlCell({ value }: { value: number }) {
  return <span className={`tabular-nums font-medium ${pnlClass(value)}`}>{usd(value)}</span>;
}
