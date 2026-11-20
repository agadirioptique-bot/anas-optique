import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/lib/orders";
import type { Database } from "@/types/database";
import type { Labeled } from "./new/data";
import type { OrderListFilters } from "./schemas";
import { orderSearchFilter } from "./search";

/** One order on the board / in lists (order_overview, RLS-scoped). */
export interface OrderRow {
  id: string;
  storeId: string;
  storeName: string;
  displayNumber: string;
  status: OrderStatus;
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientHasWhatsapp: boolean;
  total: number;
  paid: number;
  balance: number;
  discountAmount: number;
  ownFrame: boolean;
  frameName: string | null;
  createdAt: string;
  statusSince: string;
}

type OverviewRow = Database["public"]["Views"]["order_overview"]["Row"];

export function toOrderRow(r: Partial<OverviewRow>): OrderRow {
  return {
    id: r.id!,
    storeId: r.store_id!,
    storeName: r.store_name ?? "",
    displayNumber: r.display_number ?? "",
    status: r.status!,
    clientId: r.client_id!,
    clientName: r.client_name ?? "",
    clientPhone: r.client_phone ?? "",
    clientHasWhatsapp: !!r.client_has_whatsapp,
    total: r.total ?? 0,
    paid: r.paid ?? 0,
    balance: r.balance ?? 0,
    discountAmount: r.discount_amount ?? 0,
    ownFrame: !!r.client_own_frame,
    frameName: r.frame_name ?? null,
    createdAt: r.created_at!,
    statusSince: r.status_since ?? r.created_at!,
  };
}

const COLUMNS =
  "id, store_id, store_name, display_number, status, client_id, client_name, client_phone, client_has_whatsapp, client_is_loyal, total, paid, balance, discount_amount, client_own_frame, frame_name, created_at, status_since, slip_number, booklet, subtotal, store_prefix, delivered_at, cancelled_at, re_sph, re_cyl, re_axis, re_add, le_sph, le_cyl, le_axis, le_add";

/**
 * Board: every order still in progress, delivered in the last 7 days, cancelled in the last
 * 30 days (shown only with "Afficher les annulées"). storeId = super admin's top-bar store.
 */
export async function getBoardOrders(storeId: string | null): Promise<OrderRow[]> {
  const db = await createClient();
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const month = new Date(Date.now() - 30 * 86_400_000).toISOString();
  let query = db
    .from("order_overview")
    .select(COLUMNS)
    .or(`status.in.(confirmed,in_workshop,prepared,in_store),and(status.eq.delivered,delivered_at.gte.${week}),and(status.eq.cancelled,cancelled_at.gte.${month})`)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (storeId) query = query.eq("store_id", storeId);
  const { data, error } = await query;
  if (error) throw new Error("order_overview failed");
  return (data as Partial<OverviewRow>[]).map(toOrderRow);
}

const PERIOD_DAYS: Record<string, number> = { "7": 7, "30": 30, "90": 90, "365": 365 };

const LIST_LIMIT = 500;

/**
 * List view: newest first, server-side status / period / store filters and search (so the
 * 2021–2023 history is found too). Shows at most LIST_LIMIT rows; `total` counts every match.
 */
export async function getOrderList(storeId: string | null, filters: OrderListFilters): Promise<{ rows: OrderRow[]; total: number }> {
  const db = await createClient();
  let query = db.from("order_overview").select(COLUMNS, { count: "exact" }).order("created_at", { ascending: false }).limit(LIST_LIMIT);
  if (storeId) query = query.eq("store_id", storeId);
  if (filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.period !== "any") query = query.gte("created_at", new Date(Date.now() - PERIOD_DAYS[filters.period] * 86_400_000).toISOString());
  const search = orderSearchFilter(filters.q);
  if (search) query = query.or(search);
  const { data, error, count } = await query;
  if (error) throw new Error("order_overview failed");
  const rows = (data as Partial<OverviewRow>[]).map(toOrderRow);
  return { rows, total: count ?? rows.length };
}

export interface OrderReference {
  paymentMethods: Labeled[];
  cancelReasons: Labeled[];
  /** Days per status before an order is "late" (Settings › Notifications). */
  stuckDays: Partial<Record<OrderStatus, number>>;
}

export async function getOrderReference(): Promise<OrderReference> {
  const db = await createClient();
  const [lists, stuck] = await Promise.all([
    db.from("settings_list_items").select("id, list_key, label_fr, label_en").in("list_key", ["payment_methods", "cancel_reasons"]).eq("is_archived", false).order("sort"),
    db.from("app_settings").select("value").eq("key", "stuck_order_days").maybeSingle(),
  ]);
  const of = (key: string) => (lists.data ?? []).filter((i) => i.list_key === key).map((i) => ({ id: i.id, label_fr: i.label_fr, label_en: i.label_en }));
  return {
    paymentMethods: of("payment_methods"),
    cancelReasons: of("cancel_reasons"),
    stuckDays: (stuck.data?.value as Partial<Record<OrderStatus, number>> | null) ?? {},
  };
}
