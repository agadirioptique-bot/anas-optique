"use server";

import { getSessionUser } from "@/features/auth/session";
import { dbErrorCode, fail, ok, type ActionResult, type ErrorCode } from "@/lib/errors";
import { searchInput, uuidInput } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { loadClientForOrder, type ClientForOrder } from "./data";
import { createOrderPayloadSchema, photoSchema, slipCheckSchema } from "./schemas";

export interface ClientHit {
  id: string;
  full_name: string;
  phone_e164: string;
  has_whatsapp: boolean;
  is_loyal: boolean;
  orders: number;
  last_order_at: string | null;
  segment: "new" | "regular" | "loyal";
}

/** Step 1 search (name / phone); empty query = most recent clients. */
export async function searchClientsForOrder(q: unknown): Promise<ClientHit[]> {
  const parsed = searchInput(60).safeParse(q ?? "");
  if (!parsed.success || !(await getSessionUser())) return [];
  const query = parsed.data;
  const { data } = await (await createClient()).rpc("client_directory", {
    p_q: query,
    p_segment: "all",
    p_sort: query ? "name" : "recent",
    p_limit: 8,
    p_offset: 0,
  });
  return ((data as { rows?: ClientHit[] } | null)?.rows ?? []) as ClientHit[];
}

export async function getClientForOrder(id: unknown): Promise<ClientForOrder | null> {
  const parsed = uuidInput.safeParse(id);
  if (!parsed.success || !(await getSessionUser())) return null;
  return loadClientForOrder(parsed.data);
}

export type SlipCheck = { taken: false } | { taken: true; orderId: string; display: string; client: string; date: string };

/** "This slip number is already used in this store" before confirming (create_order checks again). */
export async function checkSlip(input: unknown): Promise<SlipCheck> {
  const parsed = slipCheckSchema.safeParse(input);
  if (!parsed.success || !(await getSessionUser())) return { taken: false };
  const { storeId, booklet, slipNumber } = parsed.data;
  const { data } = await (await createClient())
    .from("order_overview")
    .select("id, display_number, client_name, created_at")
    .eq("store_id", storeId)
    .eq("booklet", booklet)
    .eq("slip_number", slipNumber)
    .maybeSingle();
  return data ? { taken: true, orderId: data.id!, display: data.display_number!, client: data.client_name!, date: data.created_at! } : { taken: false };
}

export type CreateOrderResult =
  | { ok: true; orderId: string; displayNumber: string }
  | { ok: false; duplicate: { orderId: string; display: string; client: string; date: string } }
  | { ok: false; error: ErrorCode };

/** One call to create_order: client, order, items, treatments, deposit and stock in one transaction. */
export async function createOrder(input: unknown): Promise<CreateOrderResult> {
  if (!(await getSessionUser())) return { ok: false, error: "forbidden" };
  const parsed = createOrderPayloadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalidInput" };
  const { data, error } = await (await createClient()).rpc("create_order", { payload: parsed.data });
  if (error) return { ok: false, error: dbErrorCode(error) };
  const result = data as { order_id?: string; display_number?: string; error?: string; existing?: { order_id: string; display: string; client: string; date: string } };
  if (result.error === "DUPLICATE_SLIP" && result.existing) {
    const e = result.existing;
    return { ok: false, duplicate: { orderId: e.order_id, display: e.display, client: e.client, date: e.date } };
  }
  return { ok: true, orderId: result.order_id!, displayNumber: result.display_number! };
}

/** After the browser uploaded the photo to private/prescriptions/{orderId}/… */
export async function attachPrescriptionPhoto(input: unknown): Promise<ActionResult> {
  if (!(await getSessionUser())) return fail("forbidden");
  const parsed = photoSchema.safeParse(input);
  if (!parsed.success) return fail("invalidInput");
  const { error } = await (await createClient()).rpc("set_prescription_photo", { p_order_id: parsed.data.orderId, p_path: parsed.data.path });
  return error ? fail(dbErrorCode(error)) : ok(undefined);
}
