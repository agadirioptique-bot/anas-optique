"use server";

import { getSuperAdmin } from "@/features/auth/guards";
import { getSessionUser } from "@/features/auth/session";
import { dbErrorCode, fail, ok, type ActionResult } from "@/lib/errors";
import { searchInput, uuidInput } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { clientSchema, discountSchema, updateClientSchema } from "./schemas";

/** Any signed-in user can create clients (shared by all stores). Contact fields only. */
export async function createClientRecord(input: unknown): Promise<ActionResult<{ id: string }>> {
  if (!(await getSessionUser())) return fail("forbidden");
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) return fail("invalidInput");
  const d = parsed.data;
  const { data, error } = await (await createClient())
    .from("clients")
    .insert({ full_name: d.fullName, phone_e164: d.phone, has_whatsapp: d.hasWhatsapp, notes: d.notes })
    .select("id")
    .single();
  if (error) return fail(dbErrorCode(error, { onUnique: "phoneExists" }));
  return ok({ id: data.id });
}

export async function updateClientRecord(input: unknown): Promise<ActionResult> {
  if (!(await getSessionUser())) return fail("forbidden");
  const parsed = updateClientSchema.safeParse(input);
  if (!parsed.success) return fail("invalidInput");
  const d = parsed.data;
  const { error } = await (await createClient())
    .from("clients")
    .update({ full_name: d.fullName, phone_e164: d.phone, has_whatsapp: d.hasWhatsapp, notes: d.notes })
    .eq("id", d.id);
  return error ? fail(dbErrorCode(error, { onUnique: "phoneExists" })) : ok(undefined);
}

/** "A client with a similar name already exists" while typing a new client. */
export async function findSimilarClients(name: unknown): Promise<{ id: string; full_name: string; phone_e164: string }[]> {
  const parsed = searchInput(120, 3).safeParse(name);
  if (!parsed.success || !(await getSessionUser())) return [];
  const { data } = await (await createClient()).rpc("similar_clients", { p_name: parsed.data });
  return data ?? [];
}

/** Pre-approved discount for the client's next order (super admin, SPEC §6). */
export async function setClientDiscount(input: unknown): Promise<ActionResult> {
  if (!(await getSuperAdmin())) return fail("forbidden");
  const parsed = discountSchema.safeParse(input);
  if (!parsed.success) return fail("invalidInput");
  const d = parsed.data;
  const { error } = await (await createClient()).rpc("set_client_discount", {
    p_client_id: d.clientId,
    p_type: d.type,
    p_value: d.value,
    p_note: d.note ?? undefined,
  });
  return error ? fail(dbErrorCode(error)) : ok(undefined);
}

export async function clearClientDiscount(clientId: unknown): Promise<ActionResult> {
  if (!(await getSuperAdmin())) return fail("forbidden");
  const parsed = uuidInput.safeParse(clientId);
  if (!parsed.success) return fail("invalidInput");
  const { error } = await (await createClient()).rpc("clear_client_discount", { p_client_id: parsed.data });
  return error ? fail(dbErrorCode(error)) : ok(undefined);
}
