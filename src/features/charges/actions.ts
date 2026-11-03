"use server";

import { getSuperAdmin } from "@/features/auth/guards";
import { adminWrite } from "@/features/settings/admin-action";
import { dbErrorCode, fail, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { getChargeHistory } from "./queries";
import { activeSchema, approveSchema, chargeSchema, deletedSchema, idSchema, orderLookupSchema, recurringSchema } from "./schemas";

/**
 * Charges are written directly by the super admin (RLS + column privileges); the database fills
 * approval / deletion / audit columns and checks category and location (charges_before_write).
 */
export async function saveCharge(input: unknown) {
  return adminWrite(chargeSchema, input, (d, db) => {
    const row = {
      amount: d.amount,
      charge_date: d.chargeDate,
      category_id: d.categoryId,
      location_id: d.locationId,
      reason: d.reason,
      order_id: d.orderId ?? null,
    };
    return d.id ? db.from("charges").update(row).eq("id", d.id) : db.from("charges").insert(row);
  });
}

/** Soft delete / restore (charges are never hard-deleted). Supplier-payment rows refuse (CHARGE_READ_ONLY). */
export async function setChargeDeleted(input: unknown) {
  return adminWrite(deletedSchema, input, (d, db) => db.from("charges").update({ is_deleted: d.deleted }).eq("id", d.id));
}

/** Pending → approved, optionally with a corrected amount (approve_charge). */
export async function approveCharge(input: unknown): Promise<ActionResult> {
  if (!(await getSuperAdmin())) return fail("forbidden");
  const p = approveSchema.safeParse(input);
  if (!p.success) return fail("invalidInput");
  const { error } = await (await createClient()).rpc("approve_charge", { p_charge_id: p.data.id, p_amount: p.data.amount });
  return error ? fail(dbErrorCode(error)) : ok(undefined);
}

export interface OrderMatch {
  id: string;
  displayNumber: string;
  clientName: string;
}

/** Order number lookup for the optional link ("832", "CNT-00832"…), through search_global. */
export async function findOrders(input: unknown): Promise<ActionResult<OrderMatch[]>> {
  if (!(await getSuperAdmin())) return fail("forbidden");
  const p = orderLookupSchema.safeParse(input);
  if (!p.success) return fail("invalidInput");
  const { data, error } = await (await createClient()).rpc("search_global", { q: p.data.q });
  if (error) return fail(dbErrorCode(error));
  const orders = ((data as { orders?: { id: string; display_number: string; client_name: string }[] } | null)?.orders ?? []).slice(0, 6);
  return ok(orders.map((o) => ({ id: o.id, displayNumber: o.display_number, clientName: o.client_name })));
}

export async function saveRecurring(input: unknown) {
  return adminWrite(recurringSchema, input, (d, db) => {
    const row = { label: d.label, amount: d.amount, category_id: d.categoryId, location_id: d.locationId, day_of_month: d.dayOfMonth, is_active: d.isActive };
    return d.id ? db.from("recurring_charges").update(row).eq("id", d.id) : db.from("recurring_charges").insert(row);
  });
}

export async function setRecurringActive(input: unknown) {
  return adminWrite(activeSchema, input, (d, db) => db.from("recurring_charges").update({ is_active: d.active }).eq("id", d.id));
}

/** Only a recurring charge that never generated a charge can be deleted (FK → "inUse"); otherwise deactivate it. */
export async function deleteRecurring(input: unknown) {
  return adminWrite(idSchema, input, (d, db) => db.from("recurring_charges").delete().eq("id", d.id));
}

export async function loadChargeHistory(input: unknown): Promise<ActionResult<Awaited<ReturnType<typeof getChargeHistory>>>> {
  if (!(await getSuperAdmin())) return fail("forbidden");
  const p = idSchema.safeParse(input);
  if (!p.success) return fail("invalidInput");
  try {
    return ok(await getChargeHistory(p.data.id));
  } catch {
    return fail("unexpected");
  }
}
