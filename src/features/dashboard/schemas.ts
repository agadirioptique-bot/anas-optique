import { z } from "zod";
import { COMPARISONS, PRESETS } from "./periods";

/** URL filters of the dashboard; anything invalid falls back to the default. No store = top-bar store. */
export const dashboardSearchSchema = z.object({
  period: z.enum(PRESETS).catch("thisMonth").default("thisMonth"),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  store: z.union([z.literal("all"), z.uuid()]).optional().catch(undefined),
  compare: z.enum(COMPARISONS).catch("m1").default("m1"),
});

export type DashboardFilters = z.output<typeof dashboardSearchSchema>;
