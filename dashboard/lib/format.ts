export function priceUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function usd(n: number, compact = false): string {
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  if (compact && v >= 1000) {
    return `${sign}$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  }
  return `${sign}$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function pct(n: number, digits = 1): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function pnlClass(n: number): string {
  if (n > 0) return "text-emerald-400";
  if (n < 0) return "text-rose-400";
  return "text-zinc-400";
}
