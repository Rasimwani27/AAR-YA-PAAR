/** Forward-test strategy presets (configs at repo root). */

export type ForwardStrategyId = "fade-reversal" | "london-mid-engulf";

export const FORWARD_STRATEGIES: {
  id: ForwardStrategyId;
  label: string;
  config: string;
  description: string;
}[] = [
  {
    id: "fade-reversal",
    label: "Fade-reversal (AFNY)",
    config: "config.btc.fade-reversal-ny-trend.toml",
    description: "London break → NY 3m reversal · 4h trend",
  },
  {
    id: "london-mid-engulf",
    label: "London mid winner",
    config: "config.btc.london-mid-engulf-winner.toml",
    description: "London mid + BE @ $200 · skip Mon & 17–18 IST",
  },
];

export function configsArg(selected: ForwardStrategyId[]): string {
  return selected
    .map((id) => {
      const s = FORWARD_STRATEGIES.find((x) => x.id === id);
      return s ? `${id}:${s.config}` : null;
    })
    .filter(Boolean)
    .join(",");
}
