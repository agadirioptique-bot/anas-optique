import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface ListItemRow {
  id: string;
  listKey: string;
  code: string | null;
  labelFr: string;
  labelEn: string;
  isArchived: boolean;
  uses: number;
}

/** All list items (super admin, RLS) with how many rows use them. */
export async function getListItems(): Promise<ListItemRow[]> {
  const db = await createClient();
  const [{ data: items, error }, { data: usage }] = await Promise.all([
    db.from("settings_list_items").select("id, list_key, code, label_fr, label_en, is_archived, sort").order("sort").order("label_fr"),
    db.from("settings_list_usage").select("item_id, uses"),
  ]);
  if (error) throw new Error("settings_list_items failed");
  const uses = new Map((usage ?? []).map((u) => [u.item_id, u.uses ?? 0]));
  return (items ?? []).map((i) => ({
    id: i.id,
    listKey: i.list_key,
    code: i.code,
    labelFr: i.label_fr,
    labelEn: i.label_en,
    isArchived: i.is_archived,
    uses: uses.get(i.id) ?? 0,
  }));
}
