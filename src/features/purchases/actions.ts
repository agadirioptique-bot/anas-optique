"use server";

import { getSuperAdmin } from "@/features/auth/guards";
import { adminWrite } from "@/features/settings/admin-action";
import { dbErrorCode, fail, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { paymentSchema, purchaseSchema, supplierArchiveSchema, supplierIdSchema, supplierSchema } from "./schemas";

/** Goods received: one RPC writes the purchase, its lines, the stock movements and the first payment. */
export async function createPurchase(input: unknown): Promise<ActionResult<{ id: string }>> {
  if (!(await getSuperAdmin())) return fail("forbidden");
  const p = purchaseSchema.safeParse(input);
  if (!p.success) return fail("invalidInput");
  const d = p.data;
  const { data, error } = await (await createClient()).rpc("create_purchase", {
    payload: {
      supplier_id: d.supplierId,
      receive_store_id: d.receiveStoreId,
      purchase_date: d.purchaseDate,
      supplier_ref: d.supplierRef || null,
      note: d.note || null,
      lines: d.lines.map((l) =>
        l.kind === "stock"
          ? { kind: "stock", category_id: l.categoryId, unit_price: l.unitPrice, qty: l.qty }
          : { kind: "lens", description: l.description, amount: l.amount },
      ),
      payment: d.payment ? { amount: d.payment.amount, method_id: d.payment.methodId, paid_at: d.payment.paidAt } : null,
    },
  });
  return error ? fail(dbErrorCode(error)) : ok({ id: data as string });
}

/** ≤ remaining (checked under lock by the database); the trigger creates the read-only charge. */
export async function addSupplierPayment(input: unknown): Promise<ActionResult> {
  if (!(await getSuperAdmin())) return fail("forbidden");
  const p = paymentSchema.safeParse(input);
  if (!p.success) return fail("invalidInput");
  const d = p.data;
  const { error } = await (await createClient()).rpc("add_supplier_payment", {
    p_purchase_id: d.purchaseId,
    p_amount: d.amount,
    p_paid_at: d.paidAt,
    p_method_id: d.methodId,
    p_note: d.note || undefined,
  });
  return error ? fail(dbErrorCode(error)) : ok(undefined);
}

/** Suppliers are configuration: written directly, RLS allows the super admin only. Returns the id (new purchase form). */
export async function saveSupplier(input: unknown): Promise<ActionResult<{ id: string }>> {
  if (!(await getSuperAdmin())) return fail("forbidden");
  const p = supplierSchema.safeParse(input);
  if (!p.success) return fail("invalidInput");
  const d = p.data;
  const row = { name: d.name, phone: d.phone || null, note: d.note || null };
  const db = await createClient();
  const { data, error } = d.id
    ? await db.from("suppliers").update(row).eq("id", d.id).select("id").single()
    : await db.from("suppliers").insert(row).select("id").single();
  return error ? fail(dbErrorCode(error, { onUnique: "duplicateName" })) : ok({ id: data.id });
}

export async function setSupplierArchived(input: unknown) {
  return adminWrite(supplierArchiveSchema, input, (d, db) => db.from("suppliers").update({ is_archived: d.archived }).eq("id", d.id), {
    onUnique: "duplicateName",
  });
}

/** Only a supplier without purchases can be deleted (FK → "inUse"); otherwise archive it. */
export async function deleteSupplier(input: unknown) {
  return adminWrite(supplierIdSchema, input, (d, db) => db.from("suppliers").delete().eq("id", d.id));
}
