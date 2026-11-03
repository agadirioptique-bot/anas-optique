/**
 * Purchase money in the browser (live totals, payment chips). Worked in cents so the numbers match
 * the database's numeric(12,2); the database still computes and checks the real totals.
 */
export const toCents = (amount: number) => Math.round(amount * 100);
export const fromCents = (cents: number) => cents / 100;

export type DraftLine = { kind: "stock"; unitPrice?: number; qty: number } | { kind: "lens"; amount?: number };

export function lineTotal(line: DraftLine): number {
  return line.kind === "stock" ? fromCents(toCents(line.unitPrice ?? 0) * line.qty) : fromCents(toCents(line.amount ?? 0));
}

export function purchaseTotal(lines: DraftLine[]): number {
  return fromCents(lines.reduce((sum, l) => sum + toCents(lineTotal(l)), 0));
}

/** pct % of an amount, to the cent; 100 % is exactly the amount. */
export function percentOf(amount: number, pct: number): number {
  return pct === 100 ? amount : fromCents(Math.round((toCents(amount) * pct) / 100));
}

/** YYYY-MM-DD of today in the browser's calendar (the user's local day). */
export function todayIso(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
