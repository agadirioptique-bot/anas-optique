import type { OrderStatus } from "@/lib/orders";

/** Statuses the workshop works on, in order. */
export const QUEUE = ["confirmed", "in_workshop", "prepared"] as const satisfies readonly OrderStatus[];
export type QueueStatus = (typeof QUEUE)[number];

export type StuckDays = Partial<Record<OrderStatus, number>>;

interface Timed {
  status: OrderStatus;
  createdAt: string;
  statusSince: string;
}

const DAY = 86_400_000;

/** Whole days between a date and now (same rule as the board's "for N days"). */
export function daysSince(value: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(value).getTime()) / DAY));
}

/** Late = more days in the current status than `stuck_order_days[status]` (SPEC §11); no setting → never late. */
export function isLate(order: Timed, stuckDays: StuckDays, now: Date): boolean {
  const limit = stuckDays[order.status];
  return limit !== undefined && daysSince(order.statusSince, now) > limit;
}

export type Tone = "ok" | "soon" | "late";

/** Progress bar of a card: share of the allowed days used, and its colour (amber on the last allowed day). */
export function progress(order: Timed, stuckDays: StuckDays, now: Date): { ratio: number; tone: Tone } {
  const limit = stuckDays[order.status];
  const days = daysSince(order.statusSince, now);
  if (limit === undefined) return { ratio: 0, tone: "ok" };
  const tone: Tone = days > limit ? "late" : days >= limit ? "soon" : "ok";
  return { ratio: Math.min(1, (days + 1) / (limit + 1)), tone };
}

export interface WorkshopSummary {
  total: number;
  /** Average days since the order was created, rounded. */
  averageAge: number;
  late: number;
  byStatus: Record<QueueStatus, number>;
}

export function workshopSummary(orders: Timed[], stuckDays: StuckDays, now: Date): WorkshopSummary {
  const byStatus = Object.fromEntries(QUEUE.map((s) => [s, 0])) as Record<QueueStatus, number>;
  let ages = 0;
  let late = 0;
  for (const o of orders) {
    if ((QUEUE as readonly string[]).includes(o.status)) byStatus[o.status as QueueStatus] += 1;
    ages += daysSince(o.createdAt, now);
    if (isLate(o, stuckDays, now)) late += 1;
  }
  return { total: orders.length, averageAge: orders.length ? Math.round(ages / orders.length) : 0, late, byStatus };
}
