import { z } from "zod";

const qty = z.number().int().positive().max(9999);

/** One-step transfer, several categories at once (create_transfer). */
export const transferSchema = z
  .object({
    fromStoreId: z.uuid(),
    toStoreId: z.uuid(),
    lines: z.array(z.object({ categoryId: z.uuid(), qty })).min(1).max(50),
    note: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.fromStoreId !== d.toStoreId, { path: ["toStoreId"] })
  .refine((d) => new Set(d.lines.map((l) => l.categoryId)).size === d.lines.length, { path: ["lines"] });

/** Damaged / broken items: the reason is required (record_damage). */
export const damageSchema = z.object({
  storeId: z.uuid(),
  categoryId: z.uuid(),
  qty,
  reason: z.string().trim().min(1).max(200),
});

/** Set the level to what was counted (adjust_stock). */
export const adjustSchema = z.object({
  storeId: z.uuid(),
  categoryId: z.uuid(),
  counted: z.number().int().min(0).max(99999),
  reasonId: z.uuid(),
  note: z.string().trim().max(500).optional(),
});

export const historySchema = z.object({ storeId: z.uuid(), categoryId: z.uuid() });

/** `?location=` on the Stock page. */
export const stockSearchSchema = z.object({ location: z.uuid().optional().catch(undefined) });

export type TransferInput = z.input<typeof transferSchema>;
export type DamageInput = z.input<typeof damageSchema>;
export type AdjustInput = z.input<typeof adjustSchema>;
