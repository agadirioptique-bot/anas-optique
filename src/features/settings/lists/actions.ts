"use server";

import { adminWrite } from "../admin-action";
import { archiveSchema, idSchema } from "../shared-schemas";
import { createListItemSchema, renameListItemSchema } from "./schemas";

export async function createListItem(input: unknown) {
  return adminWrite(createListItemSchema, input, async (d, db) => {
    const { data: last } = await db
      .from("settings_list_items")
      .select("sort")
      .eq("list_key", d.listKey)
      .order("sort", { ascending: false })
      .limit(1)
      .maybeSingle();
    return db
      .from("settings_list_items")
      .insert({ list_key: d.listKey, label_fr: d.labelFr, label_en: d.labelEn, sort: (last?.sort ?? 0) + 1 });
  });
}

export async function renameListItem(input: unknown) {
  return adminWrite(renameListItemSchema, input, (d, db) =>
    db.from("settings_list_items").update({ label_fr: d.labelFr, label_en: d.labelEn }).eq("id", d.id),
  );
}

export async function setListItemArchived(input: unknown) {
  return adminWrite(archiveSchema, input, (d, db) => db.from("settings_list_items").update({ is_archived: d.archived }).eq("id", d.id));
}

/** Only unused, non-system items (system items have a `code` the database relies on; FK → "inUse"). */
export async function deleteListItem(input: unknown) {
  return adminWrite(idSchema, input, (d, db) => db.from("settings_list_items").delete().eq("id", d.id).is("code", null));
}
