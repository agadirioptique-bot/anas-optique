import "server-only";
import type { CustomFieldDef } from "@/components/shared/custom-field-input";
import type { SessionUser } from "@/features/auth/types";
import { eyesFromRow, type EyePrescription } from "@/features/orders/lib/prescription";
import { createClient } from "@/lib/supabase/server";

export interface Labeled {
  id: string;
  label_fr: string;
  label_en: string;
}

export interface ClientForOrder {
  id: string;
  full_name: string;
  phone_e164: string;
  has_whatsapp: boolean;
  is_loyal: boolean;
  loyal_since: string | null;
  orders: number;
  pendingDiscount: { type: "percent" | "amount"; value: number; note: string | null } | null;
  lastRx: { od: EyePrescription; og: EyePrescription; at: string } | null;
}

export interface NewOrderData {
  stores: { id: string; name: string; prefix: string }[];
  defaultStoreId: string;
  padding: number;
  productTypes: { id: string; key: string; label_fr: string; label_en: string; is_frame: boolean }[];
  categories: { id: string; typeId: string; name: string; salePrice: number }[];
  /** "storeId:categoryId" → quantity in stock */
  stock: Record<string, number>;
  lensTypes: Labeled[];
  treatments: Labeled[];
  paymentMethods: Labeled[];
  fields: (CustomFieldDef & { id: string; isBuiltin: boolean })[];
  prefillClient: ClientForOrder | null;
}

/** Client card of step 1: cross-store order count, pending discount, last visible measurements. */
export async function loadClientForOrder(id: string): Promise<ClientForOrder | null> {
  const db = await createClient();
  const [client, stats, last] = await Promise.all([
    db.from("clients").select("id, full_name, phone_e164, has_whatsapp, is_loyal, loyal_since, pending_discount_type, pending_discount_value, pending_discount_note").eq("id", id).maybeSingle(),
    db.rpc("client_order_stats", { p_client_id: id }),
    db
      .from("order_overview")
      .select("created_at, re_sph, re_cyl, re_axis, re_add, le_sph, le_cyl, le_axis, le_add")
      .eq("client_id", id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const c = client.data;
  if (!c) return null;
  const rx = last.data as Parameters<typeof eyesFromRow>[0] & { created_at: string } | null;
  return {
    id: c.id,
    full_name: c.full_name,
    phone_e164: c.phone_e164,
    has_whatsapp: c.has_whatsapp,
    is_loyal: c.is_loyal,
    loyal_since: c.loyal_since,
    orders: (stats.data as { orders?: number } | null)?.orders ?? 0,
    pendingDiscount: c.pending_discount_type
      ? { type: c.pending_discount_type, value: c.pending_discount_value ?? 0, note: c.pending_discount_note }
      : null,
    lastRx: rx ? { ...eyesFromRow(rx), at: rx.created_at } : null,
  };
}

export async function getNewOrderData(user: SessionUser, activeStore: string, clientId: string | null): Promise<NewOrderData> {
  const db = await createClient();
  const [stores, padding, types, categories, stock, lists, fields, prefill] = await Promise.all([
    db.from("stores").select("id, name, prefix").eq("kind", "store").eq("is_active", true).order("name"),
    db.from("app_settings").select("value").eq("key", "slip_number_padding").maybeSingle(),
    db.from("product_types").select("id, key, label_fr, label_en, is_frame").eq("is_archived", false).order("sort"),
    db.from("product_categories").select("id, product_type_id, name, sale_price").eq("is_archived", false).order("sort").order("name"),
    db.from("stock_levels").select("store_id, category_id, quantity"),
    db
      .from("settings_list_items")
      .select("id, list_key, label_fr, label_en")
      .in("list_key", ["lens_types", "treatments", "payment_methods", "vision_types"])
      .eq("is_archived", false)
      .order("sort"),
    db.from("custom_fields").select("id, key, label_fr, label_en, field_type, options, visibility, is_builtin").order("sort"),
    clientId ? loadClientForOrder(clientId) : Promise.resolve(null),
  ]);
  const visibleStores = (stores.data ?? []).filter((s) => user.role === "super_admin" || s.id === user.storeId);
  const byList = (key: string): Labeled[] =>
    (lists.data ?? []).filter((i) => i.list_key === key).map((i) => ({ id: i.id, label_fr: i.label_fr, label_en: i.label_en }));
  const visionOptions = byList("vision_types").map((v) => ({ value: v.id, label_fr: v.label_fr, label_en: v.label_en }));

  return {
    stores: visibleStores,
    defaultStoreId: visibleStores.find((s) => s.id === activeStore)?.id ?? visibleStores.find((s) => s.id === user.storeId)?.id ?? visibleStores[0]?.id ?? "",
    padding: (padding.data?.value as { digits?: number } | null)?.digits ?? 5,
    productTypes: types.data ?? [],
    categories: (categories.data ?? []).map((c) => ({ id: c.id, typeId: c.product_type_id, name: c.name, salePrice: c.sale_price })),
    stock: Object.fromEntries((stock.data ?? []).map((s) => [`${s.store_id}:${s.category_id}`, s.quantity ?? 0])),
    lensTypes: byList("lens_types"),
    treatments: byList("treatments"),
    paymentMethods: byList("payment_methods"),
    fields: (fields.data ?? []).map((f) => ({
      id: f.id,
      key: f.key,
      labelFr: f.label_fr,
      labelEn: f.label_en,
      fieldType: f.field_type,
      options: f.key === "vision_type" ? visionOptions : Array.isArray(f.options) ? (f.options as CustomFieldDef["options"]) : [],
      visibility: f.visibility,
      isBuiltin: f.is_builtin,
    })),
    prefillClient: prefill,
  };
}
