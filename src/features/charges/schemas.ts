import { z } from "zod";
import { PERIODS } from "./lib";

const money = z.number().finite().positive().max(9_999_999_999.99);

/** Not in the future, with one day of slack for time zones (same rule as purchases). */
const pastDate = z.iso.date().refine((d) => d <= new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));

/** Manual charge (new or edit). Reason required (SPEC §5.4); the order link is optional. */
export const chargeSchema = z.object({
  id: z.uuid().optional(),
  amount: money,
  chargeDate: pastDate,
  categoryId: z.uuid(),
  locationId: z.uuid(),
  reason: z.string().trim().min(1).max(200),
  orderId: z.uuid().nullable().optional(),
});

export const recurringSchema = z.object({
  id: z.uuid().optional(),
  label: z.string().trim().min(1).max(120),
  amount: money,
  categoryId: z.uuid(),
  locationId: z.uuid(),
  dayOfMonth: z.number().int().min(1).max(28),
  isActive: z.boolean().default(true),
});

export const approveSchema = z.object({ id: z.uuid(), amount: money.optional() });
export const deletedSchema = z.object({ id: z.uuid(), deleted: z.boolean() });
export const activeSchema = z.object({ id: z.uuid(), active: z.boolean() });
export const idSchema = z.object({ id: z.uuid() });
export const orderLookupSchema = z.object({ q: z.string().trim().min(1).max(40) });

/** URL filters of the Charges page; anything invalid falls back to the default. */
export const chargeFiltersSchema = z.object({
  tab: z.enum(["charges", "recurring"]).catch("charges").default("charges"),
  period: z.enum(PERIODS).catch("month").default("month"),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  location: z.uuid().optional().catch(undefined),
  category: z.uuid().optional().catch(undefined),
  status: z.enum(["all", "approved", "pending"]).catch("all").default("all"),
  deleted: z.enum(["0", "1"]).catch("0").default("0"),
});

export type ChargeFilters = z.output<typeof chargeFiltersSchema>;
