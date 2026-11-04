import "server-only";
import { eyesFromRow, type EyePrescription } from "@/features/orders/lib/prescription";
import { toOrderRow, type OrderRow } from "@/features/orders/queries";
import { createClient } from "@/lib/supabase/server";
import { QUEUE } from "./lib";

interface Labeled {
  label_fr: string;
  label_en: string;
}

/** One card of the workshop queue: the order, its prescription and what to make. */
export interface WorkshopOrder extends OrderRow {
  rx: { od: EyePrescription; og: EyePrescription };
  lensType: Labeled | null;
  treatments: Labeled[];
  lensDetails: string | null;
  epRe: number | null;
  epLe: number | null;
  fittingHeight: number | null;
}

const OVERVIEW =
  "id, store_id, store_name, display_number, status, client_id, client_name, client_phone, client_has_whatsapp, total, paid, balance, discount_amount, client_own_frame, frame_name, created_at, status_since, re_sph, re_cyl, re_axis, re_add, le_sph, le_cyl, le_axis, le_add";

/** Orders in confirmed / in workshop / prepared, oldest first (super admin; storeId = top-bar store or every store). */
export async function getWorkshopQueue(storeId: string | null): Promise<WorkshopOrder[]> {
  const db = await createClient();
  let overview = db.from("order_overview").select(OVERVIEW).in("status", [...QUEUE]).order("created_at").limit(500);
  let details = db
    .from("orders")
    .select(
      "id, lens_details, ep_re, ep_le, fitting_height, lens_type:settings_list_items!orders_lens_type_id_fkey(label_fr, label_en), order_treatments(settings_list_items(label_fr, label_en, sort))",
    )
    .in("status", [...QUEUE])
    .limit(500);
  if (storeId) {
    overview = overview.eq("store_id", storeId);
    details = details.eq("store_id", storeId);
  }
  const [rows, extra] = await Promise.all([overview, details]);
  if (rows.error || extra.error) throw new Error("workshop queue failed");
  const byId = new Map(extra.data.map((d) => [d.id, d]));
  return rows.data.map((r) => {
    const d = byId.get(r.id!);
    return {
      ...toOrderRow(r),
      rx: eyesFromRow({
        re_sph: r.re_sph, re_cyl: r.re_cyl, re_axis: r.re_axis, re_add: r.re_add,
        le_sph: r.le_sph, le_cyl: r.le_cyl, le_axis: r.le_axis, le_add: r.le_add,
      }),
      lensType: d?.lens_type ?? null,
      treatments: (d?.order_treatments ?? [])
        .map((t) => t.settings_list_items)
        .filter((t): t is Labeled & { sort: number } => !!t)
        .toSorted((a, b) => a.sort - b.sort),
      lensDetails: d?.lens_details ?? null,
      epRe: d?.ep_re ?? null,
      epLe: d?.ep_le ?? null,
      fittingHeight: d?.fitting_height ?? null,
    };
  });
}

/** Sidebar badge (SPEC §11): orders waiting for or in the workshop, within the top-bar store. */
export async function getWorkshopBadgeCount(storeId: string | null): Promise<number> {
  const db = await createClient();
  let query = db.from("orders").select("id", { count: "exact", head: true }).in("status", ["confirmed", "in_workshop"]);
  if (storeId) query = query.eq("store_id", storeId);
  const { count } = await query;
  return count ?? 0;
}
