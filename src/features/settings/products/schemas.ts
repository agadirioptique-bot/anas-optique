import { z } from "zod";
import { label, optionalLabel, withEnglishFallback } from "../shared-schemas";

export const price = z.number().min(0).max(1_000_000).multipleOf(0.01);

export const renameTypeSchema = z
  .object({ id: z.uuid(), labelFr: label, labelEn: optionalLabel.optional() })
  .transform(withEnglishFallback);

export const createCategorySchema = z.object({
  typeId: z.uuid(),
  name: z.string().trim().min(1).max(60),
  salePrice: price,
});

export const updateCategorySchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(60),
  salePrice: price,
});

/** null = no threshold row = no low-stock alert (SPEC §11). */
export const thresholdSchema = z.object({
  storeId: z.uuid(),
  categoryId: z.uuid(),
  min: z.number().int().min(0).max(9999).nullable(),
});
