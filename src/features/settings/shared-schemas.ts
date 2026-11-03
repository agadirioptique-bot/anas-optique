import { z } from "zod";

export const label = z.string().trim().min(1).max(80);
export const optionalLabel = z.string().trim().max(80);

/** Tables that can be drag-sorted (allow-list also enforced by reorder_rows). */
export const SORTABLE_TABLES = ["settings_list_items", "custom_fields", "product_types", "product_categories", "charge_locations"] as const;

export const reorderSchema = z.object({
  table: z.enum(SORTABLE_TABLES),
  ids: z.array(z.uuid()).min(1).max(500),
});

export const archiveSchema = z.object({ id: z.uuid(), archived: z.boolean() });
export const idSchema = z.object({ id: z.uuid() });

/** French label is required; English falls back to it. */
export function withEnglishFallback<T extends { labelFr: string; labelEn?: string }>(v: T) {
  return { ...v, labelEn: v.labelEn?.trim() ? v.labelEn.trim() : v.labelFr };
}
