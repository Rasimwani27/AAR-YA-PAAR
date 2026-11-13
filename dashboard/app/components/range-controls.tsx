"use client";

import { DEFAULT_RANGE, RANGE_PRESETS, validateRange } from "@/lib/backtest-config";

type Props = {
  start: string;
  end: string;
  disabled: boolean;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  onPreset: (start: string, end: string) => void;
  onRun: () => void;
  onLoadCache?: () => void;
  loading: boolean;
};

export function RangeControls({
  start,
  end,
  disabled,
  onStartChange,
  onEndChange,
  onPreset,
  onRun,
  onLoadCache,
  loading,
}: Props) {
  const err = validateRange(start, end);

  return (
    <div className="mt-4 space-y-3 border-t border-zinc-800/60 pt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Date range (UTC)</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          From
          <input
            type="date"
            value={start}
            min="2020-01-01"
            max="2030-12-31"
            disabled={disabled}
            onChange={(e) => onStartChange(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          To
          <input
            type="date"
            value={end}
            min="2020-01-01"
            max="2030-12-31"
            disabled={disabled}
            onChange={(e) => onEndChange(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          />
        </label>
        <button
          type="button"
          disabled={disabled || loading || Boolean(err)}
          onClick={onRun}
          className="rounded-lg bg-amber-500/90 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {loading ? "Running…" : "Run range"}
        </button>
        {onLoadCache ? (
          <button
            type="button"
            disabled={disabled || loading}
            onClick={onLoadCache}
            className="rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            Load saved
          </button>
        ) : null}
      </div>
      {err ? <p className="text-xs text-rose-400">{err}</p> : null}
      <div className="flex flex-wrap gap-2">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => onPreset(p.start, p.end)}
            className="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-400 hover:border-amber-500/50 hover:text-amber-200 disabled:opacity-50"
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onPreset(DEFAULT_RANGE.start, DEFAULT_RANGE.end)}
          className="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-400 hover:border-amber-500/50 hover:text-amber-200 disabled:opacity-50"
        >
          Reset default
        </button>
      </div>
      <p className="text-[11px] text-zinc-600">
        Downloads missing months from data.binance.vision (needs internet). Shorter ranges fail less often.
      </p>
    </div>
  );
}
