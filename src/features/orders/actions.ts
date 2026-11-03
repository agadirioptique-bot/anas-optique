"use server";

import { getSessionUser } from "@/features/auth/session";
import { dbErrorCode, fail, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { cancelSchema, changeStatusSchema, deliverSchema, freeDiscountSchema, paymentSchema } from "./schemas";

/** Every order write goes through one RPC that checks role, store and rules itself (SPEC §6). */
async function rpc(run: (db: Awaited<ReturnType<typeof createClient>>) => PromiseLike<{ error: { message?: string; code?: string } | null }>): Promise<ActionResult> {
  if (!(await getSessionUser())) return fail("forbidden");
  const { error } = await run(await createClient());
  return error ? fail(dbErrorCode(error)) : ok(undefined);
}

export async function changeOrderStatus(input: unknown) {
  const p = changeStatusSchema.safeParse(input);
  if (!p.success) return fail("invalidInput");
  return rpc((db) => db.rpc("change_order_status", { p_order_id: p.data.orderId, p_to_status: p.data.to }));
}

export async function addOrderPayment(input: unknown) {
  const p = paymentSchema.safeParse(input);
  if (!p.success) return fail("invalidInput");
  return rpc((db) => db.rpc("add_payment", { p_order_id: p.data.orderId, p_amount: p.data.amount, p_method_id: p.data.methodId }));
}

/** Optional final payment + delivered in one transaction. */
export async function deliverOrder(input: unknown) {
  const p = deliverSchema.safeParse(input);
  if (!p.success) return fail("invalidInput");
  const payment = p.data.payment ? { amount: p.data.payment.amount, method_id: p.data.payment.methodId } : undefined;
  return rpc((db) => db.rpc("deliver_order", { p_order_id: p.data.orderId, p_final_payment: payment }));
}

/** Super admin (checked by the database too): stock back, optional refund ≤ paid. */
export async function cancelOrder(input: unknown) {
  const p = cancelSchema.safeParse(input);
  if (!p.success) return fail("invalidInput");
  const d = p.data;
  return rpc((db) =>
    db.rpc("cancel_order", {
      p_order_id: d.orderId,
      p_reason_id: d.reasonId,
      p_note: d.note,
      p_refund_amount: d.refundAmount,
      p_refund_method_id: d.refundMethodId ?? undefined,
    }),
  );
}

/** Super admin, before delivery: amount ≤ balance, never below the frame/items price. */
export async function applyFreeDiscount(input: unknown) {
  const p = freeDiscountSchema.safeParse(input);
  if (!p.success) return fail("invalidInput");
  return rpc((db) => db.rpc("apply_free_discount", { p_order_id: p.data.orderId, p_amount: p.data.amount }));
}
