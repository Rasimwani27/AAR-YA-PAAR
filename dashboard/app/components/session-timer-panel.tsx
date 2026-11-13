"use client";

import { useCallback, useEffect, useState } from "react";

import { dashboardClientFetch, readJsonResponse } from "@/lib/api-fetch";
import type { SessionTimerHistoryEntry } from "@/lib/session-timer";

type TimerSnap = {
  running: boolean;
  started_at: string | null;
  elapsed_ms: number;
  display: string;
  label: string;
  history?: SessionTimerHistoryEntry[];
};

function eventLabel(e: SessionTimerHistoryEntry): string {
  if (e.event === "start") return "Started";
  if (e.event === "stop") return "Stopped";
  if (e.event === "reset") return "Reset";
  if (e.event === "interrupted") return "Interrupted (PC off)";
  return e.event;
}

function eventTone(e: SessionTimerHistoryEntry): string {
  if (e.event === "interrupted") return "text-amber-300";
  if (e.event === "start") return "text-emerald-300";
  if (e.event === "stop") return "text-zinc-300";
  return "text-zinc-500";
}

export function SessionTimerPanel({ disabled }: { disabled?: boolean }) {
  const [snap, setSnap] = useState<TimerSnap | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await dashboardClientFetch("/api/session-timer");
      const body = await readJsonResponse<TimerSnap & { ok?: boolean }>(res);
      setSnap(body);
    } catch {
      setSnap(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!snap?.running) return;
    const id = window.setInterval(() => void load(), 1000);
    return () => window.clearInterval(id);
  }, [snap?.running, load]);

  const act = async (action: "start" | "stop" | "reset") => {
    setBusy(true);
    try {
      const res = await dashboardClientFetch("/api/session-timer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await readJsonResponse<TimerSnap & { ok?: boolean }>(res);
      setSnap(body);
    } finally {
      setBusy(false);
    }
  };

  const history = snap?.history ?? [];

  return (
    <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[140px] flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Session timer</p>
          <p className="text-2xl font-mono tabular-nums text-zinc-100">{snap?.display ?? "0:00"}</p>
          {snap?.running && snap.started_at ? (
            <p className="text-[10px] text-emerald-400/90">Running since {new Date(snap.started_at).toLocaleString()}</p>
          ) : (
            <p className="text-[10px] text-zinc-600">Stopped — press Start when you begin</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || busy || snap?.running}
            onClick={() => void act("start")}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            Start
          </button>
          <button
            type="button"
            disabled={disabled || busy || !snap?.running}
            onClick={() => void act("stop")}
            className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
          >
            Stop
          </button>
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void act("reset")}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-900 disabled:opacity-40"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300"
          >
            History ({history.length})
          </button>
        </div>
      </div>

      {showHistory && history.length > 0 ? (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-800/80 bg-zinc-900/40">
          <ul className="divide-y divide-zinc-800/60 text-[11px]">
            {history.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
                <span className={`font-semibold ${eventTone(e)}`}>{eventLabel(e)}</span>
                <span className="tabular-nums text-zinc-500">
                  {e.stopped_at
                    ? `Ended ${new Date(e.stopped_at).toLocaleString()}`
                    : new Date(e.at).toLocaleString()}
                </span>
                {e.session_started_at && e.event !== "reset" ? (
                  <span className="w-full text-zinc-600">
                    Session from {new Date(e.session_started_at).toLocaleString()}
                    {e.note ? ` · ${e.note}` : null}
                  </span>
                ) : e.note ? (
                  <span className="w-full text-zinc-600">{e.note}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-[10px] text-zinc-600">
        History saved on disk. If the PC shuts down while running, the next open records{" "}
        <span className="text-amber-400/90">Interrupted</span> with the last heartbeat time (~2 min tolerance).
      </p>
    </section>
  );
}
