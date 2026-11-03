/**
 * Quantity pill (SPEC §8): no threshold row → neutral; below the minimum → red; at the minimum →
 * amber. "Low stock" = at or below the minimum, the same rule as the low-stock notification.
 */
export type StockState = "none" | "ok" | "atMin" | "below";

export function stockState(qty: number, min: number | null): StockState {
  if (min === null) return "none";
  if (qty < min) return "below";
  if (qty === min) return "atMin";
  return "ok";
}

export function isLowStock(qty: number, min: number | null): boolean {
  return min !== null && qty <= min;
}
