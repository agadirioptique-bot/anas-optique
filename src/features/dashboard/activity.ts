/**
 * Activity calendar and leave advice (SPEC §9 « Calendrier d'activité et congés »).
 * Pure helpers for the dashboard card; every count and index comes from `kpi_activity` (SQL).
 * Dates are ISO `YYYY-MM-DD` strings computed in UTC, so no time zone can shift a day.
 */

export type ActivityLevel = "calm" | "normal" | "busy";

/** kpi_activity: orders per business day (all time) and the seasonality of the reference years. */
export interface KpiActivity {
  today: string;
  days: { d: string; n: number; legacy: boolean }[];
  /** Finished years with orders in at least 10 months; empty → no advice yet. */
  years: number[];
  months: { month: number; index: number; level: ActivityLevel }[];
  weeks: { week: number; index: number; level: ActivityLevel }[];
  /** The 52 weeks from the Monday of the current week. */
  upcoming: { start: string; week: number; index: number; level: ActivityLevel }[];
}

const DAY = 86_400_000;
const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const toIso = (time: number) => new Date(time).toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  return toIso(toTime(iso) + days * DAY);
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(iso: string): number {
  return ((new Date(toTime(iso)).getUTCDay() + 6) % 7) + 1;
}

/** ISO week number (1–53) of a date. */
export function isoWeek(iso: string): number {
  const thursday = toTime(addDays(iso, 4 - isoWeekday(iso)));
  const yearStart = Date.UTC(new Date(thursday).getUTCFullYear(), 0, 1);
  return Math.floor((thursday - yearStart) / DAY / 7) + 1;
}

export type CalendarView = "last12" | number;

/** The days a view covers: the last 12 months up to today, or a whole calendar year. */
export function viewRange(view: CalendarView, today: string): { from: string; to: string } {
  if (view === "last12") return { from: addDays(today, -364), to: today };
  return { from: `${view}-01-01`, to: `${view}-12-31` };
}

export interface CalendarColumn {
  /** Monday of the week. */
  start: string;
  /** Monday → Sunday; null outside the range (or after today). */
  days: (string | null)[];
}

/**
 * GitHub-style grid: one column per week (Monday → Sunday) from the week of `from` to the week of
 * `to`, and a month label on the first column of each month (dropped when the first two labels
 * would sit on top of each other).
 */
export function calendarColumns(from: string, to: string, today: string): { columns: CalendarColumn[]; months: { col: number; month: number }[] } {
  const last = to < today ? to : today;
  const columns: CalendarColumn[] = [];
  for (let start = addDays(from, 1 - isoWeekday(from)); start <= to; start = addDays(start, 7)) {
    columns.push({
      start,
      days: Array.from({ length: 7 }, (_, i) => {
        const d = addDays(start, i);
        return d >= from && d <= last ? d : null;
      }),
    });
  }
  const months: { col: number; month: number }[] = [];
  let previous = -1;
  columns.forEach((c, col) => {
    const first = c.start < from ? from : c.start;
    const month = Number(first.slice(5, 7));
    if (month !== previous) months.push({ col, month });
    previous = month;
  });
  if (months.length > 1 && months[1].col - months[0].col < 3) months.shift();
  return { columns, months };
}

/**
 * Colour level of a day, like GitHub: 0 = no order, then 1–4 by quartile of the days with orders
 * in the range shown.
 */
export function dayLevels(counts: number[]): (n: number) => 0 | 1 | 2 | 3 | 4 {
  const sorted = counts.filter((n) => n > 0).toSorted((a, b) => a - b);
  const at = (p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? 0;
  const [q1, q2, q3] = [at(0.25), at(0.5), at(0.75)];
  return (n) => (n <= 0 ? 0 : n <= q1 ? 1 : n <= q2 ? 2 : n <= q3 ? 3 : 4);
}

export interface WeekRange {
  /** Monday of the first week. */
  start: string;
  /** Sunday of the last week. */
  end: string;
  weeks: number;
  /** Average index of the weeks (1 = an ordinary week). */
  index: number;
}

/** Consecutive upcoming weeks of one level, merged into periods (leave windows, weeks to be there). */
export function weekRanges(upcoming: KpiActivity["upcoming"], level: ActivityLevel): WeekRange[] {
  const ranges: { start: string; end: string; indexes: number[] }[] = [];
  let open: (typeof ranges)[number] | null = null;
  for (const w of upcoming) {
    if (w.level !== level) {
      open = null;
      continue;
    }
    if (!open) {
      open = { start: w.start, end: addDays(w.start, 6), indexes: [] };
      ranges.push(open);
    }
    open.end = addDays(w.start, 6);
    open.indexes.push(w.index);
  }
  return ranges.map((r) => ({
    start: r.start,
    end: r.end,
    weeks: r.indexes.length,
    index: Math.round((r.indexes.reduce((s, i) => s + i, 0) / r.indexes.length) * 100) / 100,
  }));
}

/** The 12 months from the current one, with their seasonal level. */
export function upcomingMonths(months: KpiActivity["months"], today: string): { year: number; month: number; index: number; level: ActivityLevel }[] {
  if (months.length === 0) return [];
  const year = Number(today.slice(0, 4));
  const current = Number(today.slice(5, 7));
  return Array.from({ length: 12 }, (_, i) => {
    const month = ((current - 1 + i) % 12) + 1;
    const m = months.find((x) => x.month === month);
    return { year: year + Math.floor((current - 1 + i) / 12), month, index: m?.index ?? 1, level: m?.level ?? "normal" };
  });
}

/** Level of the ISO week a date falls in (week 53 joins 52, as in SQL). */
export function weekLevel(weeks: KpiActivity["weeks"], iso: string): ActivityLevel | null {
  if (weeks.length === 0) return null;
  const week = Math.min(isoWeek(iso), 52);
  return weeks.find((w) => w.week === week)?.level ?? null;
}
