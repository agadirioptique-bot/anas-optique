import { describe, expect, it } from "vitest";
import { createOrderPayloadSchema, type CreateOrderPayload } from "./schemas";

const ID = "a75dbe63-27ca-40ce-be75-108492cfe040";
const ID2 = "bfe48c02-4eac-4cf7-bd69-28d4ae22ae2d";

const base: CreateOrderPayload = {
  store_id: ID,
  booklet: "",
  slip_number: 832,
  client_id: ID,
  re_sph: -1.25, re_cyl: -0.5, re_axis: 90, re_add: null,
  le_sph: -1, le_cyl: null, le_axis: null, le_add: null,
  ep_re: 31.5, ep_le: null, fitting_height: null,
  vision_type_id: null, doctor_name: null, prescription_date: "2026-10-28",
  custom_values: { distance_lecture: 40 },
  lens_type_id: ID2, lens_details: null, treatment_ids: [ID2],
  items: [{ category_id: ID2, qty: 1 }],
  client_own_frame: false,
  subtotal: 1850,
  apply_client_discount: false,
  deposit: { amount: 500, method_id: ID2 },
};

describe("createOrderPayloadSchema", () => {
  it("accepts a complete order", () => {
    expect(createOrderPayloadSchema.safeParse(base).success).toBe(true);
  });

  it("needs exactly one way to identify the client", () => {
    expect(createOrderPayloadSchema.safeParse({ ...base, client_id: undefined }).success).toBe(false);
    expect(
      createOrderPayloadSchema.safeParse({ ...base, new_client: { full_name: "Salma", phone_e164: "+212612345678", has_whatsapp: true } }).success,
    ).toBe(false);
  });

  it("rejects prescriptions off the 0.25 grid, bad axes and slips", () => {
    expect(createOrderPayloadSchema.safeParse({ ...base, re_sph: -1.3 }).success).toBe(false);
    expect(createOrderPayloadSchema.safeParse({ ...base, re_axis: 200 }).success).toBe(false);
    expect(createOrderPayloadSchema.safeParse({ ...base, slip_number: 0 }).success).toBe(false);
    expect(createOrderPayloadSchema.safeParse({ ...base, booklet: "b" }).success).toBe(false);
  });

  it("needs a payment method when a deposit is taken, and unique items", () => {
    expect(createOrderPayloadSchema.safeParse({ ...base, deposit: { amount: 500, method_id: null } }).success).toBe(false);
    expect(createOrderPayloadSchema.safeParse({ ...base, deposit: { amount: 0, method_id: null } }).success).toBe(true);
    expect(createOrderPayloadSchema.safeParse({ ...base, items: [{ category_id: ID2, qty: 1 }, { category_id: ID2, qty: 2 }] }).success).toBe(false);
  });
});
