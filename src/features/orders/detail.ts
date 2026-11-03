import "server-only";
import type { CustomFieldDef } from "@/components/shared/custom-field-input";
import { createClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/lib/orders";
import { eyesFromRow } from "./lib/prescription";
import { toOrderRow } from "./queries";

type Labeled = { label_fr: string; label_en: string };

/** Everything the order page shows, read with the user's own client (RLS decides). */
export async function getOrderDetail(id: string) {
  const db = await createClient();
  const [overview, order] = await Promise.all([
    db.from("order_overview").select("*").eq("id", id).maybeSingle(),
    db.from("orders").select("*").eq("id", id).maybeSingle(),
  ]);
  if (!overview.data || !order.data) return null;
  const o = order.data;

  const [items, treatments, payments, history, fields, lists, client] = await Promise.all([
    db.from("order_items").select("id, qty, unit_price, product_categories(name, product_types(label_fr, label_en, is_frame))").eq("order_id", id),
    db.from("order_treatments").select("settings_list_items(label_fr, label_en)").eq("order_id", id),
    db.from("payments").select("id, amount, kind, received_at, received_by, settings_list_items(label_fr, label_en)").eq("order_id", id).order("received_at"),
    db.from("order_status_history").select("from_status, to_status, changed_at, changed_by").eq("order_id", id).order("changed_at"),
    db.from("custom_fields").select("key, label_fr, label_en, field_type, options, visibility, is_builtin").order("sort"),
    db
      .from("settings_list_items")
      .select("id, label_fr, label_en")
      .in("id", [o.lens_type_id, o.vision_type_id, o.cancel_reason_id].filter((x): x is string => !!x)),
    db.from("clients").select("id, full_name, phone_e164, has_whatsapp, is_loyal, notes").eq("id", o.client_id).maybeSingle(),
  ]);

  const userIds = [o.created_by, o.cancelled_by, ...(history.data ?? []).map((h) => h.changed_by), ...(payments.data ?? []).map((p) => p.received_by)].filter(
    (x): x is string => !!x,
  );
  const [{ data: names }, photo] = await Promise.all([
    db.rpc("user_names", { p_ids: [...new Set(userIds)] }),
    o.prescription_photo_path ? db.storage.from("private").createSignedUrl(o.prescription_photo_path, 600) : Promise.resolve(null),
  ]);
  const name = new Map((names ?? []).map((n) => [n.id, n.full_name]));
  const label = new Map((lists.data ?? []).map((l) => [l.id, l]));

  return {
    row: toOrderRow(overview.data),
    order: {
      ...eyesFromRow(o),
      epRe: o.ep_re,
      epLe: o.ep_le,
      fittingHeight: o.fitting_height,
      doctorName: o.doctor_name,
      prescriptionDate: o.prescription_date,
      visionType: o.vision_type_id ? (label.get(o.vision_type_id) ?? null) : null,
      customValues: (o.custom_values ?? {}) as Record<string, string | number>,
      lensType: o.lens_type_id ? (label.get(o.lens_type_id) ?? null) : null,
      lensDetails: o.lens_details,
      subtotal: o.subtotal,
      discountAmount: o.discount_amount,
      discountSource: o.discount_source,
      frameRevenue: o.frame_revenue,
      cancelReason: o.cancel_reason_id ? (label.get(o.cancel_reason_id) ?? null) : null,
      cancelNote: o.cancel_note,
      cancelledAt: o.cancelled_at,
      createdBy: o.created_by ? (name.get(o.created_by) ?? null) : null,
      photoPath: o.prescription_photo_path,
    },
    photoUrl: photo && "data" in photo ? (photo.data?.signedUrl ?? null) : null,
    items: (items.data ?? []).map((i) => ({
      id: i.id,
      qty: i.qty,
      unitPrice: i.unit_price,
      name: i.product_categories?.name ?? "",
      type: (i.product_categories?.product_types ?? null) as (Labeled & { is_frame: boolean }) | null,
    })),
    treatments: (treatments.data ?? []).map((t) => t.settings_list_items).filter((x): x is Labeled => !!x),
    payments: (payments.data ?? []).map((p) => ({
      id: p.id,
      amount: p.amount,
      kind: p.kind,
      at: p.received_at,
      by: p.received_by ? (name.get(p.received_by) ?? null) : null,
      method: p.settings_list_items as Labeled | null,
    })),
    events: (history.data ?? []).map((h) => ({ from: h.from_status as OrderStatus | null, to: h.to_status as OrderStatus, at: h.changed_at, by: h.changed_by ? (name.get(h.changed_by) ?? null) : null })),
    fields: (fields.data ?? []).map(
      (f): CustomFieldDef & { isBuiltin: boolean } => ({
        key: f.key,
        labelFr: f.label_fr,
        labelEn: f.label_en,
        fieldType: f.field_type,
        options: Array.isArray(f.options) ? (f.options as CustomFieldDef["options"]) : [],
        visibility: f.visibility,
        isBuiltin: f.is_builtin,
      }),
    ),
    client: client.data,
  };
}
export type OrderDetailData = NonNullable<Awaited<ReturnType<typeof getOrderDetail>>>;
