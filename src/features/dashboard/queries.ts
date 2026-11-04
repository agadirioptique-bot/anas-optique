import "server-only";
import { toOrderRow, type OrderRow } from "@/features/orders/queries";
import { createClient } from "@/lib/supabase/server";
import { comparisonRange, periodRange, type Range } from "./periods";
import type { DashboardFilters } from "./schemas";

type Db = Awaited<ReturnType<typeof createClient>>;

/** kpi_summary (SPEC §9). Money values are numeric(12,2) summed in SQL. */
export interface KpiSummary {
  revenue: number;
  collected: number;
  charges: number;
  net: number;
  orders: number;
  avg_basket: number | null;
  balance_to_collect: number;
  discounts: number;
  created: number;
  cancelled: number;
  cancellation_rate: number | null;
  damaged_frames: number;
  owed_to_suppliers: number;
  served_clients: number;
  loyal_clients: number;
  repeat_rate: number | null;
  workshop_days_in_store: number | null;
  workshop_days_delivered: number | null;
  pending_charges_count: number;
  pending_charges_amount: number;
}

export interface KpiPoint {
  at: string;
  revenue: number;
  collected: number;
  charges: number;
  net: number;
  orders: number;
  avg_basket: number | null;
  cancellation_rate: number | null;
  balance_to_collect: number;
}

export interface KpiSeries {
  bucket: "hour" | "day" | "month";
  points: KpiPoint[];
}

interface Labeled {
  label_fr: string;
  label_en: string;
  count: number;
}

export interface KpiBreakdown {
  stores: { store_id: string; name: string; kind: "store" | "lab"; revenue: number; orders: number; collected: number; charges: number; net: number }[];
  general_charges: number | null;
  frame_categories: { name: string; count: number; revenue: number }[];
  own_frames: number;
  treatments: Labeled[];
  lens_types: Labeled[];
  segments: { new: number; regular: number; loyal: number };
  loyalty_threshold: number;
  heatmap: { dow: number; hour: number; orders: number }[];
  lead_times: { name: string; to_in_store: number | null; to_delivered: number | null; measured: number }[];
}

export interface PendingChargeRow {
  id: string;
  reason: string;
  amount: number;
  chargeDate: string;
  location: { label_fr: string; label_en: string };
}

export interface LowStockRow {
  storeId: string;
  storeName: string;
  categoryId: string;
  categoryName: string;
  quantity: number;
  min: number;
}

export interface DashboardData {
  today: string;
  range: Range;
  previous: Range | null;
  storeId: string | null;
  summary: KpiSummary;
  previousSummary: KpiSummary | null;
  series: KpiSeries;
  previousSeries: KpiSeries | null;
  breakdown: KpiBreakdown;
  pickup: { rows: OrderRow[]; total: number };
  pendingCharges: PendingChargeRow[];
  lowStock: { rows: LowStockRow[]; total: number };
}

async function rpc<T>(db: Db, fn: "kpi_summary" | "kpi_timeseries" | "kpi_breakdown", range: Range, storeId: string | null): Promise<T> {
  const { data, error } = await db.rpc(fn, { p_from: range.from, p_to: range.to, p_store_id: storeId ?? undefined });
  if (error) throw new Error(`${fn} failed`);
  return data as T;
}

const PICKUP_COLUMNS =
  "id, store_id, store_name, display_number, status, client_id, client_name, client_phone, client_has_whatsapp, total, paid, balance, discount_amount, client_own_frame, frame_name, created_at, status_since";

/** Glasses waiting for pick-up (in store), oldest first. */
async function getPickup(db: Db, storeId: string | null) {
  let query = db.from("order_overview").select(PICKUP_COLUMNS, { count: "exact" }).eq("status", "in_store").order("status_since").limit(6);
  if (storeId) query = query.eq("store_id", storeId);
  const { data, count, error } = await query;
  if (error) throw new Error("pickup failed");
  return { rows: data.map(toOrderRow), total: count ?? 0 };
}

async function getPendingCharges(db: Db, storeId: string | null): Promise<PendingChargeRow[]> {
  let locations: string[] | null = null;
  if (storeId) {
    const { data } = await db.from("charge_locations").select("id").eq("store_id", storeId);
    locations = (data ?? []).map((l) => l.id);
  }
  let query = db
    .from("charge_overview")
    .select("id, reason, amount, charge_date, location_label_fr, location_label_en")
    .eq("status", "pending")
    .eq("is_deleted", false)
    .order("charge_date")
    .limit(6);
  if (locations) query = query.in("location_id", locations.length ? locations : ["00000000-0000-0000-0000-000000000000"]);
  const { data, error } = await query;
  if (error) throw new Error("pending charges failed");
  return data.map((c) => ({
    id: c.id!,
    reason: c.reason ?? "",
    amount: c.amount ?? 0,
    chargeDate: c.charge_date!,
    location: { label_fr: c.location_label_fr ?? "", label_en: c.location_label_en ?? "" },
  }));
}

/** At or below the threshold (same rule as the Stock page and the low-stock notification). */
async function getLowStock(db: Db, storeId: string | null, stores: Map<string, string>) {
  let query = db.from("stock_overview").select("store_id, category_id, category_name, quantity, low_stock_min").not("low_stock_min", "is", null).eq("is_archived", false);
  if (storeId) query = query.eq("store_id", storeId);
  const { data, error } = await query;
  if (error) throw new Error("low stock failed");
  const low = data
    .filter((r) => (r.quantity ?? 0) <= (r.low_stock_min ?? -1))
    .map((r) => ({
      storeId: r.store_id!,
      storeName: stores.get(r.store_id!) ?? "",
      categoryId: r.category_id!,
      categoryName: r.category_name ?? "",
      quantity: r.quantity ?? 0,
      min: r.low_stock_min ?? 0,
    }))
    .toSorted((a, b) => a.quantity - a.min - (b.quantity - b.min) || a.categoryName.localeCompare(b.categoryName));
  return { rows: low.slice(0, 6), total: low.length };
}

/** Everything the dashboard shows for one filter state; the queries run in parallel. */
export async function getDashboard(
  filters: DashboardFilters,
  today: string,
  storeId: string | null,
  stores: { id: string; name: string }[],
): Promise<DashboardData> {
  const db = await createClient();
  const range = periodRange(filters.period, today, { from: filters.from, to: filters.to });
  const previous = comparisonRange(range, filters.compare);
  const storeNames = new Map(stores.map((s) => [s.id, s.name]));
  const [summary, previousSummary, series, previousSeries, breakdown, pickup, pendingCharges, lowStock] = await Promise.all([
    rpc<KpiSummary>(db, "kpi_summary", range, storeId),
    previous ? rpc<KpiSummary>(db, "kpi_summary", previous, storeId) : null,
    rpc<KpiSeries>(db, "kpi_timeseries", range, storeId),
    previous ? rpc<KpiSeries>(db, "kpi_timeseries", previous, storeId) : null,
    rpc<KpiBreakdown>(db, "kpi_breakdown", range, storeId),
    getPickup(db, storeId),
    getPendingCharges(db, storeId),
    getLowStock(db, storeId, storeNames),
  ]);
  return { today, range, previous, storeId, summary, previousSummary, series, previousSeries, breakdown, pickup, pendingCharges, lowStock };
}
