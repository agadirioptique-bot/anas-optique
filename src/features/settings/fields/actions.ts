"use server";

import { adminWrite } from "../admin-action";
import { idSchema } from "../shared-schemas";
import { buildOptions, createFieldSchema, slugifyKey, uniqueKey, updateFieldSchema, visibilitySchema } from "./schemas";

/** The key is generated once from the French label and never changes (orders store values by key). */
export async function createCustomField(input: unknown) {
  return adminWrite(createFieldSchema, input, async (d, db) => {
    const { data: existing } = await db.from("custom_fields").select("key, sort");
    const taken = (existing ?? []).map((f) => f.key);
    const sort = Math.max(0, ...(existing ?? []).map((f) => f.sort)) + 1;
    return db.from("custom_fields").insert({
      key: uniqueKey(slugifyKey(d.labelFr), taken),
      label_fr: d.labelFr,
      label_en: d.labelEn?.trim() || d.labelFr,
      field_type: d.fieldType,
      options: d.fieldType === "select" ? buildOptions(d.optionsFr, d.optionsEn) : [],
      visibility: d.visibility,
      sort,
    });
  });
}

/** Labels (and options for custom select fields). Built-in fields: labels only. */
export async function updateCustomField(input: unknown) {
  return adminWrite(updateFieldSchema, input, async (d, db) => {
    const { data: field } = await db.from("custom_fields").select("field_type, is_builtin").eq("id", d.id).single();
    const withOptions = field && !field.is_builtin && field.field_type === "select" && d.optionsFr.length >= 2;
    return db
      .from("custom_fields")
      .update({
        label_fr: d.labelFr,
        label_en: d.labelEn?.trim() || d.labelFr,
        ...(withOptions ? { options: buildOptions(d.optionsFr, d.optionsEn) } : {}),
      })
      .eq("id", d.id);
  });
}

export async function setFieldVisibility(input: unknown) {
  return adminWrite(visibilitySchema, input, (d, db) => db.from("custom_fields").update({ visibility: d.visibility }).eq("id", d.id));
}

/** Custom fields no order has filled in yet; built-in fields are never deleted. */
export async function deleteCustomField(input: unknown) {
  return adminWrite(idSchema, input, async (d, db) => {
    const { data: usage } = await db.from("custom_field_usage").select("orders").eq("field_id", d.id).maybeSingle();
    if ((usage?.orders ?? 0) > 0) return { fail: "inUse" as const };
    return db.from("custom_fields").delete().eq("id", d.id).eq("is_builtin", false);
  });
}
