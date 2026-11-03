import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Db = Awaited<ReturnType<typeof createClient>>;
type OverviewRow = Database["public"]["Views"]["purchase_overview"]["Row"];

export interface Labeled {
  id: string;
  label_fr: string;
  label_en: string;
}

/** One purchase in the list / detail header (purchase_overview, super admin only through RLS). */
export interface PurchaseRow {
  id: string;
  purchaseDate: string;
  createdAt: string;
  createdBy: string | null;
  supplierId: string;
  supplierName: string;
  receiveStoreId: string;
  receiveStoreName: string;
  supplierRef: string | null;
  note: string | null;
  total: number;
  paid: number;
  remaining: number;
  lineCount: number;
  stockQty: number;
}

export interface PurchaseLine {
  id: string;
  kind: "stock" | "lens";
  categoryName: string | null;
  typeLabelFr: string | null;
  typeLabelEn: string | null;
  description: string | null;
  unitPrice: number;
  qty: number;
  lineTotal: number;
}

export interface SupplierPayment {
  id: string;
  amount: number;
  paidAt: string;
  method: Labeled | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface SupplierRow {
  id: string;
  name: string;
  phone: string | null;
  note: string | null;
  isArchived: boolean;
  purchasesCount: number;
  totalBought: number;
  owed: number;
  lastPurchaseDate: string | null;
}

export interface PurchaseReference {
  suppliers: { id: string; name: string }[];
  locations: { id: string; name: string; kind: "store" | "lab" }[];
  categories: { id: string; name: string; typeId: string; typeLabelFr: string; typeLabelEn: string }[];
  methods: Labeled[];
}

function toPurchaseRow(r: OverviewRow): PurchaseRow {
  return {
    id: r.id!,
    purchaseDate: r.purchase_date!,
    createdAt: r.created_at!,
    createdBy: r.created_by,
    supplierId: r.supplier_id!,
    supplierName: r.supplier_name ?? "",
    receiveStoreId: r.receive_store_id!,
    receiveStoreName: r.receive_store_name ?? "",
    supplierRef: r.supplier_ref,
    note: r.note,
    total: r.total ?? 0,
    paid: r.paid ?? 0,
    remaining: r.remaining ?? 0,
    lineCount: r.line_count ?? 0,
    stockQty: r.stock_qty ?? 0,
  };
}

async function userNames(db: Db, ids: (string | null)[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (!unique.length) return {};
  const { data } = await db.rpc("user_names", { p_ids: unique });
  return Object.fromEntries((data ?? []).map((u) => [u.id, u.full_name]));
}

export async function getPurchases(): Promise<PurchaseRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("purchase_overview")
    .select("*")
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error("purchases failed");
  return data.map(toPurchaseRow);
}

export async function getPurchase(id: string): Promise<{
  purchase: PurchaseRow;
  lines: PurchaseLine[];
  payments: SupplierPayment[];
  users: Record<string, string>;
} | null> {
  const db = await createClient();
  const [overview, lines, payments] = await Promise.all([
    db.from("purchase_overview").select("*").eq("id", id).maybeSingle(),
    db
      .from("purchase_lines")
      .select("id, line_kind, description, unit_price, qty, line_total, product_categories(name, product_types(label_fr, label_en))")
      .eq("purchase_id", id)
      .order("created_at"),
    db
      .from("supplier_payments")
      .select("id, amount, paid_at, note, created_by, created_at, settings_list_items(id, label_fr, label_en)")
      .eq("purchase_id", id)
      .order("paid_at")
      .order("created_at"),
  ]);
  if (overview.error || lines.error || payments.error) throw new Error("purchase failed");
  if (!overview.data) return null;
  const purchase = toPurchaseRow(overview.data);
  return {
    purchase,
    lines: lines.data.map((l) => ({
      id: l.id,
      kind: l.line_kind,
      categoryName: l.product_categories?.name ?? null,
      typeLabelFr: l.product_categories?.product_types?.label_fr ?? null,
      typeLabelEn: l.product_categories?.product_types?.label_en ?? null,
      description: l.description,
      unitPrice: l.unit_price,
      qty: l.qty,
      lineTotal: l.line_total ?? 0,
    })),
    payments: payments.data.map((p) => ({
      id: p.id,
      amount: p.amount,
      paidAt: p.paid_at,
      method: p.settings_list_items,
      note: p.note,
      createdBy: p.created_by,
      createdAt: p.created_at,
    })),
    users: await userNames(db, [purchase.createdBy, ...payments.data.map((p) => p.created_by)]),
  };
}

export async function getSuppliers(): Promise<SupplierRow[]> {
  const db = await createClient();
  const [suppliers, balances] = await Promise.all([
    db.from("suppliers").select("id, name, phone, note, is_archived").order("name"),
    db.from("supplier_balances").select("supplier_id, purchases_count, total_bought, owed, last_purchase_date"),
  ]);
  if (suppliers.error || balances.error) throw new Error("suppliers failed");
  const byId = new Map(balances.data.map((b) => [b.supplier_id, b]));
  return suppliers.data.map((s) => {
    const b = byId.get(s.id);
    return {
      id: s.id,
      name: s.name,
      phone: s.phone,
      note: s.note,
      isArchived: s.is_archived,
      purchasesCount: b?.purchases_count ?? 0,
      totalBought: b?.total_bought ?? 0,
      owed: b?.owed ?? 0,
      lastPurchaseDate: b?.last_purchase_date ?? null,
    };
  });
}

/** Choices for the new purchase form: active suppliers, locations, categories, payment methods. */
export async function getPurchaseReference(): Promise<PurchaseReference> {
  const db = await createClient();
  const [suppliers, stores, categories, methods] = await Promise.all([
    db.from("suppliers").select("id, name").eq("is_archived", false).order("name"),
    db.from("stores").select("id, name, kind").eq("is_active", true).order("kind").order("name"),
    db
      .from("product_categories")
      .select("id, name, sort, product_types!inner(id, label_fr, label_en, sort, is_archived)")
      .eq("is_archived", false)
      .eq("product_types.is_archived", false),
    db.from("settings_list_items").select("id, label_fr, label_en").eq("list_key", "payment_methods").eq("is_archived", false).order("sort"),
  ]);
  if (suppliers.error || stores.error || categories.error || methods.error) throw new Error("purchase reference failed");
  return {
    suppliers: suppliers.data,
    locations: stores.data.toSorted((a, b) => Number(a.kind === "lab") - Number(b.kind === "lab")),
    categories: categories.data
      .toSorted((a, b) => a.product_types.sort - b.product_types.sort || a.sort - b.sort || a.name.localeCompare(b.name))
      .map((c) => ({
        id: c.id,
        name: c.name,
        typeId: c.product_types.id,
        typeLabelFr: c.product_types.label_fr,
        typeLabelEn: c.product_types.label_en,
      })),
    methods: methods.data,
  };
}

/** Header numbers of the Purchasing page (purchasing_summary, summed in SQL). */
export async function getPurchasingSummary(): Promise<{ owed: number; unpaidCount: number; totalBought: number }> {
  const db = await createClient();
  const { data, error } = await db.from("purchasing_summary").select("owed, unpaid_count, total_bought").single();
  if (error) throw new Error("purchasing summary failed");
  return { owed: data.owed ?? 0, unpaidCount: data.unpaid_count ?? 0, totalBought: data.total_bought ?? 0 };
}
