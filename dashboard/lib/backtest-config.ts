/** Client-safe backtest config ids (no Node fs). */

export const FULL_CONFIG = "config.btc.fade-reversal-ny-trend.toml";
export const SMOKE_CONFIG = "config.btc.fade-reversal-smoke.toml";

export const SMOKE_RANGE = {
  start: "2025-07-01",
  end: "2025-08-01",
} as const;

export const DEFAULT_RANGE = {
  start: "2021-08-01",
  end: "2026-08-01",
} as const;

export const RANGE_PRESETS = [
  { id: "full", label: "Full portfolio", start: "2021-08-01", end: "2026-08-01" },
  { id: "y2024", label: "2024 → 2026", start: "2024-01-01", end: "2026-08-01" },
  { id: "y2025", label: "2025 only", start: "2025-01-01", end: "2026-01-01" },
  { id: "y2021", label: "2021 → 2022", start: "2021-08-01", end: "2022-12-31" },
] as const;

export function isFullPortfolioReport(meta: { start?: string; end?: string }): boolean {
  if (!meta.start || !meta.end) return false;
  const startYear = Number(meta.start.slice(0, 4));
  const endYear = Number(meta.end.slice(0, 4));
  return endYear - startYear >= 4;
}

export function validateRange(start: string, end: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return "Use dates as YYYY-MM-DD.";
  }
  if (end <= start) {
    return "End date must be after start date.";
  }
  return null;
}
