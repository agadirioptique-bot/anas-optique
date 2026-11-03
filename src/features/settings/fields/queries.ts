import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { FieldOption, FieldType, Visibility } from "./schemas";

export interface FieldRow {
  id: string;
  key: string;
  labelFr: string;
  labelEn: string;
  fieldType: FieldType;
  options: FieldOption[];
  visibility: Visibility;
  isBuiltin: boolean;
  orders: number;
}

export interface FieldsData {
  fields: FieldRow[];
  /** Options of the built-in "vision type" field come from the vision_types list. */
  visionTypes: FieldOption[];
}

export async function getFieldsData(): Promise<FieldsData> {
  const db = await createClient();
  const [fields, usage, vision] = await Promise.all([
    db.from("custom_fields").select("id, key, label_fr, label_en, field_type, options, visibility, is_builtin").order("sort"),
    db.from("custom_field_usage").select("field_id, orders"),
    db.from("settings_list_items").select("id, label_fr, label_en").eq("list_key", "vision_types").eq("is_archived", false).order("sort"),
  ]);
  if (fields.error) throw new Error("custom_fields failed");
  const orders = new Map((usage.data ?? []).map((u) => [u.field_id, u.orders ?? 0]));
  return {
    fields: fields.data.map((f) => ({
      id: f.id,
      key: f.key,
      labelFr: f.label_fr,
      labelEn: f.label_en,
      fieldType: f.field_type,
      options: Array.isArray(f.options) ? (f.options as unknown as FieldOption[]) : [],
      visibility: f.visibility,
      isBuiltin: f.is_builtin,
      orders: orders.get(f.id) ?? 0,
    })),
    visionTypes: (vision.data ?? []).map((v) => ({ value: v.id, label_fr: v.label_fr, label_en: v.label_en })),
  };
}
