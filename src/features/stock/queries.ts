import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Db = Awaited<ReturnType<typeof createClient>>;
type MovementKind = Database["public"]["Enums"]["stock_movement_kind"];

/** One category at one location (stock_overview: quantities only, RLS-scoped). */
export interface StockRow {
  storeId: string;
  categoryId: string;
  categoryName: string;
  typeId: string;
  typeKey: string;
  typeLabelFr: string;
  typeLabelEn: string;
  quantity: number;
  /** null = no threshold row (no alert, neutral pill). */
  min: number | null;
  isArchived: boolean;
}

export interface StockMovement {
  id: string;
  kind: MovementKind;
  qtyDelta: number;
  balanceAfter: number;
  createdAt: string;
  createdBy: string | null;
  reason: string | null;
  reasonLabelFr: string | null;
  reasonLabelEn: string | null;
  refTable: string | null;
  refId: string | null;
  orderNumber: string | null;
  /** Transfers: the other location (super admin only). */
  transferStore: string | null;
}

export interface TransferRow {
  id: string;
  fromStoreId: string;
  toStoreId: string;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
  lines: { categoryId: string; categoryName: string; qty: number }[];
}

export interface Labeled {
  id: string;
  label_fr: string;
  label_en: string;
}

const OVERVIEW =
  "store_id, category_id, category_name, type_id, type_key, type_label_fr, type_label_en, quantity, low_stock_min, is_archived";

/** Rows for one location, or every location the caller can see (transfer dialog: quantities at the source). */
export async function getStockOverview(storeId: string | null): Promise<StockRow[]> {
  const db = await createClient();
  let query = db.from("stock_overview").select(OVERVIEW).order("type_sort").order("category_sort").order("category_name");
  if (storeId) query = query.eq("store_id", storeId);
  const { data, error } = await query;
  if (error) throw new Error("stock overview failed");
  return data.map((r) => ({
    storeId: r.store_id!,
    categoryId: r.category_id!,
    categoryName: r.category_name ?? "",
    typeId: r.type_id!,
    typeKey: r.type_key ?? "",
    typeLabelFr: r.type_label_fr ?? "",
    typeLabelEn: r.type_label_en ?? "",
    quantity: r.quantity ?? 0,
    min: r.low_stock_min ?? null,
    isArchived: !!r.is_archived,
  }));
}

/** "by Salma": profiles are not readable by secretaries, user_names is. */
async function userNames(db: Db, ids: (string | null)[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (!unique.length) return {};
  const { data } = await db.rpc("user_names", { p_ids: unique });
  return Object.fromEntries((data ?? []).map((u) => [u.id, u.full_name]));
}

const HISTORY_LIMIT = 200;

/** Latest movements first, with the level after each one. */
export async function getMovementHistory(
  storeId: string,
  categoryId: string,
): Promise<{ movements: StockMovement[]; users: Record<string, string>; truncated: boolean }> {
  const db = await createClient();
  const { data, error } = await db
    .from("stock_movement_history")
    .select("*")
    .eq("store_id", storeId)
    .eq("category_id", categoryId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(HISTORY_LIMIT + 1);
  if (error) throw new Error("stock history failed");
  const rows = data.slice(0, HISTORY_LIMIT);
  return {
    movements: rows.map((m) => ({
      id: m.id!,
      kind: m.kind!,
      qtyDelta: m.qty_delta ?? 0,
      balanceAfter: m.balance_after ?? 0,
      createdAt: m.created_at!,
      createdBy: m.created_by,
      reason: m.reason,
      reasonLabelFr: m.reason_label_fr,
      reasonLabelEn: m.reason_label_en,
      refTable: m.ref_table,
      refId: m.ref_id,
      orderNumber: m.order_display_number,
      transferStore: m.transfer_store_name,
    })),
    users: await userNames(db, rows.map((m) => m.created_by)),
    truncated: data.length > HISTORY_LIMIT,
  };
}

/** Transfer history (super admin; RLS). */
export async function getTransfers(): Promise<{ transfers: TransferRow[]; users: Record<string, string> }> {
  const db = await createClient();
  const { data, error } = await db
    .from("transfers")
    .select("id, from_store_id, to_store_id, note, created_at, created_by, transfer_lines(category_id, qty, product_categories(name))")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("transfers failed");
  return {
    transfers: data.map((t) => ({
      id: t.id,
      fromStoreId: t.from_store_id,
      toStoreId: t.to_store_id,
      note: t.note,
      createdAt: t.created_at,
      createdBy: t.created_by,
      lines: t.transfer_lines.map((l) => ({ categoryId: l.category_id, categoryName: l.product_categories?.name ?? "", qty: l.qty })),
    })),
    users: await userNames(db, data.map((t) => t.created_by)),
  };
}

export async function getAdjustmentReasons(): Promise<Labeled[]> {
  const db = await createClient();
  const { data } = await db
    .from("settings_list_items")
    .select("id, label_fr, label_en")
    .eq("list_key", "adjustment_reasons")
    .eq("is_archived", false)
    .order("sort");
  return data ?? [];
}
