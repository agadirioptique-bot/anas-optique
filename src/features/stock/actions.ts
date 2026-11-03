"use server";

import { getSuperAdmin } from "@/features/auth/guards";
import { getSessionUser } from "@/features/auth/session";
import { dbErrorCode, fail, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { getMovementHistory, type StockMovement } from "./queries";
import { adjustSchema, damageSchema, historySchema, transferSchema } from "./schemas";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Stock writes: super admin only, one RPC each; the database checks the role, locks and stock itself (SPEC §6). */
async function adminRpc(run: (db: Db) => PromiseLike<{ error: { message?: string; code?: string } | null }>): Promise<ActionResult> {
  if (!(await getSuperAdmin())) return fail("forbidden");
  const { error } = await run(await createClient());
  return error ? fail(dbErrorCode(error)) : ok(undefined);
}

export async function createTransfer(input: unknown) {
  const p = transferSchema.safeParse(input);
  if (!p.success) return fail("invalidInput");
  const d = p.data;
  return adminRpc((db) =>
    db.rpc("create_transfer", {
      p_from_store_id: d.fromStoreId,
      p_to_store_id: d.toStoreId,
      p_lines: d.lines.map((l) => ({ category_id: l.categoryId, qty: l.qty })),
      p_note: d.note || undefined,
    }),
  );
}

export async function recordDamage(input: unknown) {
  const p = damageSchema.safeParse(input);
  if (!p.success) return fail("invalidInput");
  const d = p.data;
  return adminRpc((db) => db.rpc("record_damage", { p_store_id: d.storeId, p_category_id: d.categoryId, p_qty: d.qty, p_reason: d.reason }));
}

export async function adjustStock(input: unknown) {
  const p = adjustSchema.safeParse(input);
  if (!p.success) return fail("invalidInput");
  const d = p.data;
  return adminRpc((db) =>
    db.rpc("adjust_stock", {
      p_store_id: d.storeId,
      p_category_id: d.categoryId,
      p_counted_qty: d.counted,
      p_reason_id: d.reasonId,
      p_note: d.note || undefined,
    }),
  );
}

/** History drawer, loaded on open. Both roles; RLS keeps a secretary to her store. */
export async function loadMovementHistory(
  input: unknown,
): Promise<ActionResult<{ movements: StockMovement[]; users: Record<string, string>; truncated: boolean }>> {
  if (!(await getSessionUser())) return fail("forbidden");
  const p = historySchema.safeParse(input);
  if (!p.success) return fail("invalidInput");
  try {
    return ok(await getMovementHistory(p.data.storeId, p.data.categoryId));
  } catch {
    return fail("unexpected");
  }
}
