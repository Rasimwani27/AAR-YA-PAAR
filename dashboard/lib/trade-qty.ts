const MIN_BTC_QTY = 0.001;

export function roundTradeQty(qty: number): number {
  const rounded = Math.round(Math.abs(qty) * 1_000_000) / 1_000_000;
  if (!Number.isFinite(rounded) || rounded < MIN_BTC_QTY) {
    throw new Error(`Order quantity must be at least ${MIN_BTC_QTY} BTC (got ${qty})`);
  }
  return rounded;
}

export function stopDistanceUsd(entry: number, stopPrice: number): number {
  const dist = Math.abs(entry - stopPrice);
  if (!Number.isFinite(dist) || dist <= 0) {
    throw new Error("Stop must be on the correct side of entry with a positive distance");
  }
  return dist;
}
