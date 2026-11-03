"use server";

import { getSuperAdmin } from "@/features/auth/guards";
import { dbErrorCode, fail, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { adminWrite } from "../admin-action";
import { loyaltySchema, stuckDaysSchema } from "./schemas";

/** Saves the threshold; clients already over it become loyal now. Returns how many. */
export async function setLoyaltyThreshold(input: unknown): Promise<ActionResult<{ newlyLoyal: number }>> {
  if (!(await getSuperAdmin())) return fail("forbidden");
  const parsed = loyaltySchema.safeParse(input);
  if (!parsed.success) return fail("invalidInput");
  const { data, error } = await (await createClient()).rpc("set_loyalty_threshold", { p_orders: parsed.data.orders });
  return error ? fail(dbErrorCode(error)) : ok({ newlyLoyal: data });
}

export async function setStuckDays(input: unknown) {
  return adminWrite(stuckDaysSchema, input, (d, db) => db.from("app_settings").upsert({ key: "stuck_order_days", value: d }));
}
