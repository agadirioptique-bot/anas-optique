import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { AuditEntry } from "./lib";
import type { ChargeFilters } from "./schemas";

type OverviewRow = Database["public"]["Views"]["charge_overview"]["Row"];

export interface Labeled {
  id: string;
  label_fr: string;
  label_en: string;
}

export type ChargeSource = "manual" | "supplier" | "recurring";

export interface ChargeRow {
  id: string;
  amount: number;
  chargeDate: string;
  categoryId: string;
  category: Labeled;
  locationId: string;
  location: Labeled;
  reason: string;
  orderId: string | null;
  orderNumber: string | null;
  status: "approved" | "pending";
  source: ChargeSource;
  purchaseId: string | null;
  isDeleted: boolean;
  createdAt: string;
}

export interface RecurringRow {
  id: string;
  label: string;
  amount: number;
  categoryId: string;
  locationId: string;
  dayOfMonth: number;
  isActive: boolean;
  generated: number;
}

export interface ChargeReference {
  /** Choices for new charges: active charge categories (never the supplier one), active locations. */
  categories: Labeled[];
  locations: (Labeled & { isGeneral: boolean })[];
  /** Category filter of the ledger: active charge categories, the supplier one included. */
  filterCategories: Labeled[];
  /** Every category / location, archived included, to label old rows and history. */
  labels: Record<string, Labeled>;
}

export interface ChargeTotals {
  approvedTotal: number;
  pendingTotal: number;
  approvedCount: number;
  pendingCount: number;
}

function toChargeRow(r: OverviewRow): ChargeRow {
  return {
    id: r.id!,
    amount: r.amount ?? 0,
    chargeDate: r.charge_date!,
    categoryId: r.category_id!,
    category: { id: r.category_id!, label_fr: r.category_label_fr ?? "", label_en: r.category_label_en ?? "" },
    locationId: r.location_id!,
    location: { id: r.location_id!, label_fr: r.location_label_fr ?? "", label_en: r.location_label_en ?? "" },
    reason: r.reason ?? "",
    orderId: r.order_id,
    orderNumber: r.order_display_number,
    status: r.status!,
    source: (r.source ?? "manual") as ChargeSource,
    purchaseId: r.purchase_id,
    isDeleted: !!r.is_deleted,
    createdAt: r.created_at!,
  };
}

/** Today's business date (Africa/Casablanca) from Postgres — Node's time-zone data can be stale. */
export async function getBusinessToday(): Promise<string> {
  const db = await createClient();
  const { data, error } = await db.rpc("business_date", { ts: new Date().toISOString() });
  if (error || !data) throw new Error("business date failed");
  return data;
}

export async function getCharges(filters: ChargeFilters, range: { from: string; to: string }): Promise<ChargeRow[]> {
  const db = await createClient();
  let query = db.from("charge_overview").select("*").gte("charge_date", range.from).lte("charge_date", range.to);
  if (filters.location) query = query.eq("location_id", filters.location);
  if (filters.category) query = query.eq("category_id", filters.category);
  if (filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.deleted !== "1") query = query.eq("is_deleted", false);
  const { data, error } = await query.order("charge_date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error("charges failed");
  return data.map(toChargeRow);
}

export async function getChargeTotals(filters: ChargeFilters, range: { from: string; to: string }): Promise<ChargeTotals> {
  const db = await createClient();
  const { data, error } = await db
    .rpc("charge_totals", { p_from: range.from, p_to: range.to, p_location_id: filters.location, p_category_id: filters.category })
    .single();
  if (error) throw new Error("charge totals failed");
  return { approvedTotal: data.approved_total, pendingTotal: data.pending_total, approvedCount: data.approved_count, pendingCount: data.pending_count };
}

/** Pending recurring charges waiting for approval (any month). */
export async function getPendingCharges(): Promise<ChargeRow[]> {
  const db = await createClient();
  const { data, error } = await db.from("charge_overview").select("*").eq("status", "pending").eq("is_deleted", false).order("charge_date");
  if (error) throw new Error("pending charges failed");
  return data.map(toChargeRow);
}

/** Sidebar badge (SPEC §11): pending charges count; 0 for anyone RLS hides them from. */
export async function getPendingChargeCount(): Promise<number> {
  const db = await createClient();
  const { count } = await db.from("charges").select("id", { count: "exact", head: true }).eq("status", "pending").eq("is_deleted", false);
  return count ?? 0;
}

export async function getRecurringCharges(): Promise<RecurringRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("recurring_charges")
    .select("id, label, amount, category_id, location_id, day_of_month, is_active, charges(count)")
    .order("is_active", { ascending: false })
    .order("day_of_month")
    .order("label");
  if (error) throw new Error("recurring charges failed");
  return data.map((r) => ({
    id: r.id,
    label: r.label,
    amount: r.amount,
    categoryId: r.category_id,
    locationId: r.location_id,
    dayOfMonth: r.day_of_month,
    isActive: r.is_active,
    generated: r.charges[0]?.count ?? 0,
  }));
}

export async function getChargeReference(): Promise<ChargeReference> {
  const db = await createClient();
  const [categories, locations] = await Promise.all([
    db.from("settings_list_items").select("id, label_fr, label_en, code, is_archived").eq("list_key", "charge_categories").order("sort"),
    db.from("charge_locations").select("id, label_fr, label_en, is_general, is_archived").order("sort"),
  ]);
  if (categories.error || locations.error) throw new Error("charge reference failed");
  const label = (r: Labeled): Labeled => ({ id: r.id, label_fr: r.label_fr, label_en: r.label_en });
  return {
    categories: categories.data.filter((c) => !c.is_archived && c.code !== "supplier_purchase").map(label),
    filterCategories: categories.data.filter((c) => !c.is_archived).map(label),
    locations: locations.data.filter((l) => !l.is_archived).map((l) => ({ ...label(l), isGeneral: l.is_general })),
    labels: Object.fromEntries([...categories.data, ...locations.data].map((r) => [r.id, label(r)])),
  };
}

/** audit_log rows of one charge (super admin only through RLS) + the names of their authors. */
export async function getChargeHistory(id: string): Promise<{ entries: AuditEntry[]; users: Record<string, string>; orders: Record<string, string> }> {
  const db = await createClient();
  const { data, error } = await db.from("audit_log").select("action, at, actor, old, new").eq("table_name", "charges").eq("row_id", id).order("at");
  if (error) throw new Error("charge history failed");
  const entries: AuditEntry[] = data.map((a) => ({
    action: a.action,
    at: a.at,
    actor: a.actor,
    old: (a.old as Record<string, unknown> | null) ?? null,
    new: (a.new as Record<string, unknown> | null) ?? null,
  }));
  const actors = [...new Set(entries.map((e) => e.actor).filter((x): x is string => !!x))];
  const orderIds = [
    ...new Set(entries.flatMap((e) => [e.old?.order_id, e.new?.order_id]).filter((x): x is string => typeof x === "string")),
  ];
  const [names, numbers] = await Promise.all([
    actors.length ? db.rpc("user_names", { p_ids: actors }) : Promise.resolve({ data: [] }),
    orderIds.length ? db.from("order_numbers").select("order_id, display_number").in("order_id", orderIds) : Promise.resolve({ data: [] }),
  ]);
  return {
    entries,
    users: Object.fromEntries((names.data ?? []).map((u: { id: string; full_name: string }) => [u.id, u.full_name])),
    orders: Object.fromEntries(
      ((numbers.data ?? []) as { order_id: string | null; display_number: string | null }[]).map((n) => [n.order_id ?? "", n.display_number ?? ""]),
    ),
  };
}
