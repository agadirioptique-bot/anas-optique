import { z } from "zod";
import { label, optionalLabel } from "../shared-schemas";

export const FIELD_TYPES = ["text", "number", "date", "select"] as const;
export const VISIBILITIES = ["hidden", "optional", "required"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export type Visibility = (typeof VISIBILITIES)[number];

// A type alias (not an interface) so it is assignable to the generated `Json` type.
export type FieldOption = {
  value: string;
  label_fr: string;
  label_en: string;
};

/** "Écart pupillaire (mm)" → "ecart_pupillaire_mm" (stable key stored in orders.custom_values). */
export function slugifyKey(text: string): string {
  const slug = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/, "");
  if (!slug) return "field";
  return /^[a-z]/.test(slug) ? slug : `f_${slug}`;
}

/** First free key: "base", "base_2", "base_3"… */
export function uniqueKey(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

const optionLines = z.array(z.string().trim().min(1).max(60)).max(50);

/** Select options typed one per line in FR (and optionally EN, same order). */
export function buildOptions(fr: string[], en: string[]): FieldOption[] {
  const values = new Set<string>();
  return fr.map((labelFr, i) => {
    const value = uniqueKey(slugifyKey(labelFr), values);
    values.add(value);
    return { value, label_fr: labelFr, label_en: en[i]?.trim() || labelFr };
  });
}

const fieldBody = {
  labelFr: label,
  labelEn: optionalLabel.optional(),
  optionsFr: optionLines.default([]),
  optionsEn: optionLines.default([]),
};

export const createFieldSchema = z
  .object({ ...fieldBody, fieldType: z.enum(FIELD_TYPES), visibility: z.enum(VISIBILITIES).default("optional") })
  .refine((v) => v.fieldType !== "select" || v.optionsFr.length >= 2, { path: ["optionsFr"], message: "options" });

export const updateFieldSchema = z.object({ id: z.uuid(), ...fieldBody });

export const visibilitySchema = z.object({ id: z.uuid(), visibility: z.enum(VISIBILITIES) });
