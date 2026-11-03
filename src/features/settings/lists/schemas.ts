import { z } from "zod";
import { label, optionalLabel, withEnglishFallback } from "../shared-schemas";

/** Every editable dropdown (SPEC §5.1 settings_list_items.list_key). */
export const LIST_KEYS = [
  "lens_types",
  "treatments",
  "payment_methods",
  "vision_types",
  "cancel_reasons",
  "adjustment_reasons",
  "charge_categories",
] as const;
export type ListKey = (typeof LIST_KEYS)[number];

export const createListItemSchema = z
  .object({ listKey: z.enum(LIST_KEYS), labelFr: label, labelEn: optionalLabel.optional() })
  .transform(withEnglishFallback);

export const renameListItemSchema = z
  .object({ id: z.uuid(), labelFr: label, labelEn: optionalLabel.optional() })
  .transform(withEnglishFallback);
