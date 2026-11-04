/**
 * Dashboard periods (SPEC §11 phase 11). Dates are business-day strings (YYYY-MM-DD); `today` comes
 * from Postgres (`business_date`), never from Node's clock zone.
 */
export const PRESETS = ["today", "last7", "thisMonth", "lastMonth", "thisYear", "custom"] as const;
export type Preset = (typeof PRESETS)[number];
export const COMPARISONS = ["m1", "y1", "none"] as const;
export type Comparison = (typeof COMPARISONS)[number];
export interface Range {
  from: string;
  to: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parts = (date: string) => date.split("-").map(Number) as [number, number, number];
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Same day `months` months away, clamped to that month's last day (31 Mar − 1 month → 28/29 Feb). */
export function shiftMonths(date: string, months: number): string {
  const [y, m, d] = parts(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return iso(ny, nm, Math.min(d, daysIn(ny, nm)));
}

/** "Ce mois" is month to date and "Cette année" year to date, so comparisons are like for like. */
export function periodRange(preset: Preset, today: string, custom?: Partial<Range>): Range {
  const [y, m] = parts(today);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "lastMonth": {
      const from = shiftMonths(iso(y, m, 1), -1);
      const [py, pm] = parts(from);
      return { from, to: iso(py, pm, daysIn(py, pm)) };
    }
    case "thisYear":
      return { from: iso(y, 1, 1), to: today };
    case "custom":
      if (custom?.from && custom?.to && custom.from <= custom.to) return { from: custom.from, to: custom.to };
      return { from: iso(y, m, 1), to: today };
    default:
      return { from: iso(y, m, 1), to: today };
  }
}

/** The same range one month or one year earlier; null when comparison is off. */
export function comparisonRange(range: Range, mode: Comparison): Range | null {
  if (mode === "none") return null;
  const months = mode === "m1" ? -1 : -12;
  const from = shiftMonths(range.from, months);
  let to = shiftMonths(range.to, months);
  // A whole month stays a whole month (31 Oct → 30 Sep is already clamped; 30 Sep → 31 Aug is not).
  const [ty, tm, td] = parts(range.to);
  if (td === daysIn(ty, tm)) {
    const [ny, nm] = parts(to);
    to = iso(ny, nm, daysIn(ny, nm));
  }
  return { from, to };
}

/** (current − previous) / |previous|; null when there is nothing to compare with. */
export function percentDelta(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current === null || current === undefined || previous === null || previous === undefined || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}
