/**
 * Pure helpers of the Charges page: period ranges for the filters and the per-row audit history.
 * `today` is the business date from Postgres (`business_date`), never Node's clock zone.
 */

export const PERIODS = ["month", "lastMonth", "year", "custom"] as const;
export type Period = (typeof PERIODS)[number];

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Inclusive [from, to] dates of a period. Custom falls back to the month when a bound is missing or reversed. */
export function periodRange(period: Period, today: string, custom?: { from?: string; to?: string }): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  if (period === "custom" && custom?.from && custom?.to && custom.from <= custom.to) return { from: custom.from, to: custom.to };
  if (period === "lastMonth") {
    const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
    return { from: iso(py, pm, 1), to: iso(py, pm, lastDay(py, pm)) };
  }
  if (period === "year") return { from: iso(y, 1, 1), to: iso(y, 12, 31) };
  return { from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)) };
}

/** Fields of a charge shown in its history (others are bookkeeping). */
export const TRACKED_FIELDS = ["amount", "charge_date", "category_id", "location_id", "reason", "order_id"] as const;
export type TrackedField = (typeof TRACKED_FIELDS)[number];

export interface AuditEntry {
  action: "insert" | "update" | "delete";
  at: string;
  actor: string | null;
  old: Record<string, unknown> | null;
  new: Record<string, unknown> | null;
}

export type HistoryEvent =
  | { kind: "created" | "approved" | "deleted" | "restored"; at: string; actor: string | null }
  | { kind: "edited"; at: string; actor: string | null; changes: { field: TrackedField; from: unknown; to: unknown }[] };

/**
 * audit_log rows of one charge → readable events, oldest first. One update can be an approval,
 * a delete/restore and/or edits of tracked fields (approving with a new amount = approved + edited).
 */
export function chargeHistory(entries: AuditEntry[]): HistoryEvent[] {
  const events: HistoryEvent[] = [];
  for (const e of [...entries].sort((a, b) => a.at.localeCompare(b.at))) {
    if (e.action === "insert") {
      events.push({ kind: "created", at: e.at, actor: e.actor });
      continue;
    }
    if (e.action !== "update" || !e.old || !e.new) continue;
    const { old: before, new: after } = e;
    if (before.status === "pending" && after.status === "approved") events.push({ kind: "approved", at: e.at, actor: e.actor });
    if (before.is_deleted && !after.is_deleted) events.push({ kind: "restored", at: e.at, actor: e.actor });
    const changes = TRACKED_FIELDS.filter((field) => String(before[field] ?? "") !== String(after[field] ?? "")).map((field) => ({
      field,
      from: before[field] ?? null,
      to: after[field] ?? null,
    }));
    if (changes.length) events.push({ kind: "edited", at: e.at, actor: e.actor, changes });
    if (!before.is_deleted && after.is_deleted) events.push({ kind: "deleted", at: e.at, actor: e.actor });
  }
  return events;
}
