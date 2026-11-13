/** Bybit REST / WebSocket endpoints — demo vs mainnet must never be mixed. */
export type BybitEnvironment = "demo" | "mainnet";

export const BYBIT_MAINNET_REST = "https://api.bybit.com";
export const BYBIT_DEMO_REST = "https://api-demo.bybit.com";

export const BYBIT_MAINNET_PUBLIC_WS = "wss://stream.bybit.com/v5/public/linear";
export const BYBIT_DEMO_PUBLIC_WS = "wss://stream-demo.bybit.com/v5/public/linear";
export const BYBIT_MAINNET_PRIVATE_WS = "wss://stream.bybit.com/v5/private";
export const BYBIT_DEMO_PRIVATE_WS = "wss://stream-demo.bybit.com/v5/private";

export function bybitRestBase(env: BybitEnvironment): string {
  return env === "mainnet" ? BYBIT_MAINNET_REST : BYBIT_DEMO_REST;
}

export function bybitPrivateWs(env: BybitEnvironment): string {
  return env === "mainnet" ? BYBIT_MAINNET_PRIVATE_WS : BYBIT_DEMO_PRIVATE_WS;
}

export function bybitPublicWs(env: BybitEnvironment): string {
  return env === "mainnet" ? BYBIT_MAINNET_PUBLIC_WS : BYBIT_DEMO_PUBLIC_WS;
}

export function parseBybitEnvironment(raw: unknown, fallback: BybitEnvironment = "demo"): BybitEnvironment {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "mainnet" || s === "live" || s === "production") return "mainnet";
  if (s === "demo" || s === "bybit_demo" || s === "test") return "demo";
  return fallback;
}

export function bybitEnvironmentLabel(env: BybitEnvironment): string {
  return env === "mainnet" ? "Bybit Mainnet" : "Bybit Demo Trading";
}
