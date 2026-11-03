import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface ProductTypeRow {
  id: string;
  key: string;
  labelFr: string;
  labelEn: string;
  isFrame: boolean;
  isArchived: boolean;
}

export interface CategoryRow {
  id: string;
  typeId: string;
  name: string;
  salePrice: number;
  isArchived: boolean;
}

export interface LocationRow {
  id: string;
  name: string;
  kind: "store" | "lab";
}

export interface ProductsData {
  types: ProductTypeRow[];
  categories: CategoryRow[];
  locations: LocationRow[];
  /** "storeId:categoryId" → low_stock_min */
  thresholds: Record<string, number>;
}

export async function getProductsData(): Promise<ProductsData> {
  const db = await createClient();
  const [types, categories, stores, thresholds] = await Promise.all([
    db.from("product_types").select("id, key, label_fr, label_en, is_frame, is_archived").order("sort"),
    db.from("product_categories").select("id, product_type_id, name, sale_price, is_archived").order("sort").order("name"),
    db.from("stores").select("id, name, kind").eq("is_active", true).order("kind").order("name"),
    db.from("category_thresholds").select("store_id, category_id, low_stock_min"),
  ]);
  if (types.error || categories.error || stores.error || thresholds.error) throw new Error("products settings failed");
  return {
    types: types.data.map((t) => ({ id: t.id, key: t.key, labelFr: t.label_fr, labelEn: t.label_en, isFrame: t.is_frame, isArchived: t.is_archived })),
    categories: categories.data.map((c) => ({ id: c.id, typeId: c.product_type_id, name: c.name, salePrice: c.sale_price, isArchived: c.is_archived })),
    locations: stores.data,
    thresholds: Object.fromEntries(thresholds.data.map((t) => [`${t.store_id}:${t.category_id}`, t.low_stock_min])),
  };
}
