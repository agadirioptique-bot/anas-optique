import { z } from "zod";
import { normalizePhone } from "@/lib/phone";

const optionalPhone = z
  .string()
  .trim()
  .max(30)
  .transform((v, ctx) => {
    if (!v) return null;
    const e164 = normalizePhone(v);
    if (!e164) ctx.addIssue({ code: "custom", message: "phone" });
    return e164;
  });

const storeFields = {
  name: z.string().trim().min(2).max(60),
  prefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,5}$/),
  address: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
  phone: optionalPhone,
};

export const createStoreSchema = z.object({ ...storeFields, kind: z.enum(["store", "lab"]) });
/** The kind never changes after creation (orders and secretaries depend on it). */
export const updateStoreSchema = z.object({ id: z.uuid(), ...storeFields });
export const storeActiveSchema = z.object({ id: z.uuid(), active: z.boolean() });
