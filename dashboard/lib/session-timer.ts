import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** No heartbeat for this long while "running" => treat as power loss / crash. */
const INTERRUPT_GAP_MS = 120_000;

export type SessionTimerState = {
  running: boolean;
  started_at: string | null;
  accumulated_ms: number;
  label: string;
  last_heartbeat_ms: number | null;
};

export type SessionTimerHistoryEntry = {
  id: string;
  event: "start" | "stop" | "reset" | "interrupted";
  at: string;
  session_started_at: string | null;
  stopped_at: string | null;
  elapsed_ms_at_event: number;
  note?: string;
};

const DEFAULT: SessionTimerState = {
  running: false,
  started_at: null,
  accumulated_ms: 0,
  label: "Trading session",
  last_heartbeat_ms: null,
};

function timerDir(root: string) {
  return path.join(root, "out", "forward");
}

function timerPath(root: string) {
  return path.join(timerDir(root), "session-timer.json");
}

function historyPath(root: string) {
  return path.join(timerDir(root), "session-timer-history.json");
}

export function loadSessionTimerHistory(root: string): SessionTimerHistoryEntry[] {
  const p = historyPath(root);
  if (!existsSync(p)) return [];
  try {
    const raw = JSON.parse(readFileSync(p, "utf-8")) as { entries?: SessionTimerHistoryEntry[] };
    return raw.entries ?? [];
  } catch {
    return [];
  }
}

function pushHistory(root: string, entry: Omit<SessionTimerHistoryEntry, "id">) {
  const entries = loadSessionTimerHistory(root);
  entries.unshift({ id: randomUUID(), ...entry });
  mkdirSync(timerDir(root), { recursive: true });
  writeFileSync(historyPath(root), JSON.stringify({ entries: entries.slice(0, 200) }, null, 2), "utf-8");
}

export function loadSessionTimer(root: string): SessionTimerState {
  const p = timerPath(root);
  if (!existsSync(p)) return { ...DEFAULT };
  try {
    return { ...DEFAULT, ...(JSON.parse(readFileSync(p, "utf-8")) as SessionTimerState) };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveSessionTimer(root: string, state: SessionTimerState): SessionTimerState {
  mkdirSync(timerDir(root), { recursive: true });
  writeFileSync(timerPath(root), JSON.stringify(state, null, 2), "utf-8");
  return state;
}

function formatDisplay(elapsedMs: number): string {
  const totalSec = Math.floor(elapsedMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function timerSnapshot(state: SessionTimerState, now = Date.now()) {
  let elapsed = state.accumulated_ms;
  if (state.running && state.started_at) {
    elapsed += Math.max(0, now - new Date(state.started_at).getTime());
  }
  return {
    running: state.running,
    started_at: state.started_at,
    elapsed_ms: elapsed,
    display: formatDisplay(elapsed),
    label: state.label,
    last_heartbeat_ms: state.last_heartbeat_ms,
  };
}

function recoverIfInterrupted(root: string, state: SessionTimerState, now = Date.now()): SessionTimerState {
  if (!state.running || !state.started_at) return state;
  const hb = state.last_heartbeat_ms ?? new Date(state.started_at).getTime();
  if (now - hb < INTERRUPT_GAP_MS) return state;

  const stoppedMs = hb;
  const segment = Math.max(0, stoppedMs - new Date(state.started_at).getTime());
  state.accumulated_ms += segment;
  const elapsedAt = state.accumulated_ms;

  pushHistory(root, {
    event: "interrupted",
    at: new Date(now).toISOString(),
    session_started_at: state.started_at,
    stopped_at: new Date(stoppedMs).toISOString(),
    elapsed_ms_at_event: elapsedAt,
    note: "Timer was still running when the PC shut down or the dashboard stopped (last heartbeat saved).",
  });

  state.running = false;
  state.started_at = null;
  state.last_heartbeat_ms = now;
  saveSessionTimer(root, state);
  return state;
}

/** Call on GET — updates heartbeat while running, recovers after forced shutdown. */
export function touchSessionTimer(root: string, now = Date.now()) {
  let state = loadSessionTimer(root);
  state = recoverIfInterrupted(root, state, now);
  if (state.running) {
    state.last_heartbeat_ms = now;
    saveSessionTimer(root, state);
  }
  const history = loadSessionTimerHistory(root);
  return { ...timerSnapshot(state, now), history: history.slice(0, 40) };
}

export function timerAction(root: string, action: "start" | "stop" | "reset", now = Date.now()) {
  let state = loadSessionTimer(root);
  state = recoverIfInterrupted(root, state, now);
  const nowIso = new Date(now).toISOString();

  if (action === "start") {
    if (!state.running) {
      state.running = true;
      state.started_at = nowIso;
      state.last_heartbeat_ms = now;
      saveSessionTimer(root, state);
      pushHistory(root, {
        event: "start",
        at: nowIso,
        session_started_at: nowIso,
        stopped_at: null,
        elapsed_ms_at_event: state.accumulated_ms,
      });
    }
  } else if (action === "stop") {
    if (state.running && state.started_at) {
      const started = state.started_at;
      state.accumulated_ms += Math.max(0, now - new Date(state.started_at).getTime());
      state.running = false;
      state.started_at = null;
      state.last_heartbeat_ms = now;
      saveSessionTimer(root, state);
      pushHistory(root, {
        event: "stop",
        at: nowIso,
        session_started_at: started,
        stopped_at: nowIso,
        elapsed_ms_at_event: state.accumulated_ms,
        note: "Stopped manually",
      });
    }
  } else if (action === "reset") {
    const had = state.accumulated_ms;
    state.running = false;
    state.started_at = null;
    state.accumulated_ms = 0;
    state.last_heartbeat_ms = now;
    saveSessionTimer(root, state);
    pushHistory(root, {
      event: "reset",
      at: nowIso,
      session_started_at: null,
      stopped_at: nowIso,
      elapsed_ms_at_event: had,
      note: "Timer reset to zero",
    });
  }

  const history = loadSessionTimerHistory(root);
  return { ...timerSnapshot(state, now), history: history.slice(0, 40) };
}
