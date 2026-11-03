import { z } from "zod";

/** The exact payload sent to create_order (SPEC §6). Validated again by the database. */
const diopter = z.number().min(-30).max(30).multipleOf(0.25).nullable();
const axis = z.number().int().min(0).max(180).nullable();
const measure = z.number().positive().max(99.9).nullable();
const uuid = z.uuid();

export const createOrderPayloadSchema = z
  .object({
    store_id: uuid,
    booklet: z.string().regex(/^([A-Z]{1,2})?$/),
    slip_number: z.number().int().positive().max(2_000_000_000),
    client_id: uuid.optional(),
    new_client: z
      .object({
        full_name: z.string().trim().min(2).max(120),
        phone_e164: z.string().regex(/^\+[1-9]\d{7,14}$/),
        has_whatsapp: z.boolean(),
      })
      .optional(),
    re_sph: diopter,
    re_cyl: diopter,
    re_axis: axis,
    re_add: diopter,
    le_sph: diopter,
    le_cyl: diopter,
    le_axis: axis,
    le_add: diopter,
    ep_re: measure,
    ep_le: measure,
    fitting_height: measure,
    vision_type_id: uuid.nullable(),
    doctor_name: z.string().trim().max(120).nullable(),
    prescription_date: z.iso.date().nullable(),
    custom_values: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), z.union([z.string().max(500), z.number()])),
    lens_type_id: uuid.nullable(),
    lens_details: z.string().trim().max(500).nullable(),
    treatment_ids: z.array(uuid).max(20),
    items: z.array(z.object({ category_id: uuid, qty: z.number().int().positive().max(99) })).max(20),
    client_own_frame: z.boolean(),
    subtotal: z.number().min(0).max(10_000_000).multipleOf(0.01),
    apply_client_discount: z.boolean(),
    deposit: z.object({ amount: z.number().min(0).max(10_000_000).multipleOf(0.01), method_id: uuid.nullable() }),
  })
  .refine((p) => !!p.client_id !== !!p.new_client, { path: ["client_id"], message: "client" })
  .refine((p) => p.deposit.amount === 0 || !!p.deposit.method_id, { path: ["deposit"], message: "method" })
  .refine((p) => new Set(p.items.map((i) => i.category_id)).size === p.items.length, { path: ["items"], message: "duplicate" });

export type CreateOrderPayload = z.infer<typeof createOrderPayloadSchema>;

export const slipCheckSchema = z.object({
  storeId: uuid,
  booklet: z.string().regex(/^([A-Z]{1,2})?$/),
  slipNumber: z.number().int().positive().max(2_000_000_000),
});

export const photoSchema = z.object({ orderId: uuid, path: z.string().min(1).max(300) });
