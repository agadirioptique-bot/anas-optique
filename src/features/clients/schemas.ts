import { z } from "zod";
import { normalizePhone } from "@/lib/phone";

export const SEGMENTS = ["all", "new", "regular", "loyal"] as const;
export const CLIENT_SORTS = ["recent", "name", "orders"] as const;
export type SegmentFilter = (typeof SEGMENTS)[number];
export type ClientSort = (typeof CLIENT_SORTS)[number];

/** Phones are stored in E.164; one phone may be shared by several clients, not twice under the same name (SPEC §5.3). */
export const phoneField = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const e164 = normalizePhone(v);
    if (!e164) {
      ctx.addIssue({ code: "custom", message: "phone" });
      return z.NEVER;
    }
    return e164;
  });

export const clientSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: phoneField,
  hasWhatsapp: z.boolean(),
  notes: z
    .string()
    .trim()
    .max(500)
    .transform((v) => v || null),
});

/** Editing: the phone may stay empty only for an imported client that never had one
 * (the database refuses an empty phone otherwise: OPTICOR:PHONE_REQUIRED). */
export const updateClientSchema = clientSchema.extend({
  id: z.uuid(),
  phone: z.union([z.literal("").transform(() => null), phoneField]),
});

export const discountSchema = z
  .object({
    clientId: z.uuid(),
    type: z.enum(["percent", "amount"]),
    value: z.number().positive().max(100_000).multipleOf(0.01),
    note: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.type !== "percent" || v.value <= 100, { path: ["value"], message: "percent" });

export const directorySearchSchema = z.object({
  q: z.string().trim().max(60).optional().default(""),
  segment: z.enum(SEGMENTS).catch("all"),
  sort: z.enum(CLIENT_SORTS).catch("recent"),
  limit: z.coerce.number().int().min(25).max(200).catch(50),
});
