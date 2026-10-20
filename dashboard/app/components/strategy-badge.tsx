import { strategyLabel, strategyTone } from "@/lib/forward-state";

const toneClass = {
  sky: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  amber: "bg-amber-500/15 text-amber-200 ring-amber-500/30",
  zinc: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30",
};

export function StrategyBadge({ id, compact }: { id: string; compact?: boolean }) {
  const tone = strategyTone(id);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${toneClass[tone]}`}
    >
      {compact ? id.split("-")[0] : strategyLabel(id)}
    </span>
  );
}
