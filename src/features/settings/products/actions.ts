"use server";

import { adminWrite } from "../admin-action";
import { archiveSchema } from "../shared-schemas";
import { createCategorySchema, renameTypeSchema, thresholdSchema, updateCategorySchema } from "./schemas";

export async function renameProductType(input: unknown) {
  return adminWrite(renameTypeSchema, input, (d, db) =>
    db.from("product_types").update({ label_fr: d.labelFr, label_en: d.labelEn }).eq("id", d.id),
  );
}

export async function setProductTypeArchived(input: unknown) {
  return adminWrite(archiveSchema, input, (d, db) => db.from("product_types").update({ is_archived: d.archived }).eq("id", d.id));
}

export async function createCategory(input: unknown) {
  return adminWrite(createCategorySchema, input, async (d, db) => {
    const { data: last } = await db
      .from("product_categories")
      .select("sort")
      .eq("product_type_id", d.typeId)
      .order("sort", { ascending: false })
      .limit(1)
      .maybeSingle();
    return db
      .from("product_categories")
      .insert({ product_type_id: d.typeId, name: d.name, sale_price: d.salePrice, sort: (last?.sort ?? 0) + 1 });
  });
}

/** A new sale price applies to new orders only (orders keep their price snapshot). */
export async function updateCategory(input: unknown) {
  return adminWrite(updateCategorySchema, input, (d, db) =>
    db.from("product_categories").update({ name: d.name, sale_price: d.salePrice }).eq("id", d.id),
  );
}

export async function setCategoryArchived(input: unknown) {
  return adminWrite(archiveSchema, input, (d, db) => db.from("product_categories").update({ is_archived: d.archived }).eq("id", d.id));
}

export async function setThreshold(input: unknown) {
  return adminWrite(thresholdSchema, input, (d, db) =>
    d.min === null
      ? db.from("category_thresholds").delete().eq("store_id", d.storeId).eq("category_id", d.categoryId)
      : db.from("category_thresholds").upsert({ store_id: d.storeId, category_id: d.categoryId, low_stock_min: d.min }),
  );
}
