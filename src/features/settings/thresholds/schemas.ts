import { z } from "zod";

export const loyaltySchema = z.object({ orders: z.number().int().min(1).max(100) });

export const STUCK_STATUSES = ["confirmed", "in_workshop", "prepared", "in_store"] as const;
const days = z.number().int().min(1).max(60);
export const stuckDaysSchema = z.object({
  confirmed: days,
  in_workshop: days,
  prepared: days,
  in_store: days,
});
export type StuckDays = z.infer<typeof stuckDaysSchema>;
