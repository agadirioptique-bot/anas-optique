import { zodResolver } from "@hookform/resolvers/zod";
import { createFormControl, type FieldPath } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { createOrderPayloadSchema } from "./schemas";
import type { NewOrderData } from "./data";
import { buildOrderSchema, defaultValues, discountAmount, displayNumber, itemsPrice, stepFields, toPayload, type OrderFormValues } from "./form";

const STORE = "a75dbe63-27ca-40ce-be75-108492cfe040";
const FRAME = "11111111-1111-4111-8111-111111111111";
const LENS = "22222222-2222-4222-8222-222222222222";
const CASH = "33333333-3333-4333-8333-333333333333";
const CLIENT = "44444444-4444-4444-8444-444444444444";

const data: NewOrderData = {
  stores: [{ id: STORE, name: "Succursale Centre", prefix: "CNT" }],
  defaultStoreId: STORE,
  padding: 5,
  productTypes: [],
  categories: [
    { id: FRAME, typeId: "t", name: "Catégorie B", salePrice: 500 },
    { id: LENS, typeId: "t2", name: "Lentilles 1 mois", salePrice: 250 },
  ],
  stock: {},
  lensTypes: [],
  treatments: [],
  paymentMethods: [{ id: CASH, label_fr: "Espèces", label_en: "Cash" }],
  fields: [
    { id: "f1", key: "ep_re", labelFr: "EP", labelEn: "PD", fieldType: "number", options: [], visibility: "optional", isBuiltin: true },
    { id: "f2", key: "doctor_name", labelFr: "Médecin", labelEn: "Doctor", fieldType: "text", options: [], visibility: "hidden", isBuiltin: true },
    { id: "f3", key: "distance", labelFr: "Distance", labelEn: "Distance", fieldType: "number", options: [], visibility: "required", isBuiltin: false },
  ],
  prefillClient: null,
};

const filled = (patch: Partial<OrderFormValues> = {}): OrderFormValues => ({
  ...defaultValues(data),
  slipNumber: 832,
  clientId: CLIENT,
  od: { sph: -1.25, cyl: -0.5, axis: 90, add: null },
  og: { sph: -1, cyl: null, axis: 45, add: null },
  fieldValues: { ep_re: "31,5", doctor_name: "Dr X", distance: "40" },
  frameCategoryId: FRAME,
  items: { [LENS]: 2 },
  total: 1850,
  deposit: 500,
  ...patch,
});

const t = (key: string) => key;
const schema = () => buildOrderSchema(t, { data });

describe("order form", () => {
  it("prices frame + items, and the total can't be lower", () => {
    expect(itemsPrice(filled(), data)).toBe(1000);
    expect(itemsPrice(filled({ ownFrame: true }), data)).toBe(500);
    const low = schema().safeParse(filled({ total: 900 }));
    expect(low.error?.issues.map((i) => i.path.join("."))).toContain("total");
  });

  it("checks slip, required fields and deposit", () => {
    const paths = (v: OrderFormValues) => schema().safeParse(v).error?.issues.map((i) => i.path.join(".")) ?? [];
    expect(paths(filled())).toEqual([]);
    expect(paths(filled({ slipTaken: true }))).toContain("slipNumber");
    expect(paths(filled({ slipNumber: undefined }))).toContain("slipNumber");
    expect(paths(filled({ fieldValues: {} }))).toContain("fieldValues.distance");
    expect(paths(filled({ deposit: 2000 }))).toContain("deposit");
    expect(paths(filled({ frameCategoryId: undefined, items: {} }))).toContain("frameCategoryId");
  });

  it("applies a pending discount like create_order", () => {
    const pending = { type: "percent" as const, value: 10 };
    expect(discountAmount(400, pending, true)).toBe(40);
    expect(discountAmount(400, pending, false)).toBe(0);
    expect(discountAmount(400, { type: "amount", value: 50 }, true)).toBe(50);
    // A discount may not bring the total under the products price (create_order: DISCOUNT_TOO_HIGH).
    const tooMuch = schema().safeParse(filled({ total: 1000, pendingDiscount: { type: "percent", value: 10 }, applyDiscount: true, deposit: 0 }));
    expect(tooMuch.error?.issues.map((i) => i.path.join("."))).toContain("total");
  });

  it("builds a payload the server schema accepts", () => {
    const payload = toPayload(filled(), data);
    expect(createOrderPayloadSchema.safeParse(payload).success).toBe(true);
    expect(payload.items).toEqual([
      { category_id: FRAME, qty: 1 },
      { category_id: LENS, qty: 2 },
    ]);
    expect(payload.le_axis).toBeNull(); // no cylinder → no axis
    expect(payload.ep_re).toBe(31.5);
    expect(payload.doctor_name).toBeNull(); // hidden field
    expect(payload.custom_values).toEqual({ distance: 40 });
    expect(payload.deposit).toEqual({ amount: 500, method_id: CASH });
    expect(toPayload(filled({ ownFrame: true }), data).items).toEqual([{ category_id: LENS, qty: 2 }]);
  });

  it("shows the measurement errors that block step 2 (CYL without AXE, required field)", async () => {
    const form = createFormControl<OrderFormValues>({ resolver: zodResolver(schema()), defaultValues: filled() });
    form.setValue("od", { sph: -0.5, cyl: -0.5, axis: null, add: null });
    form.setValue("fieldValues", { ep_re: "", doctor_name: "", distance: "" });

    const ok = await form.trigger(stepFields(1, data) as FieldPath<OrderFormValues>[]);

    expect(ok).toBe(false);
    // Both errors must reach formState, or the wizard says "check the flagged fields" with none flagged.
    expect(form.control._formState.errors.od?.axis?.message).toBe("rx.errors.axisRequired");
    expect(form.control._formState.errors.fieldValues?.distance?.message).toBe("wizard.fieldRequired");
    expect(stepFields(1, data)).toEqual([
      "od.sph", "od.cyl", "od.axis", "od.add", "og.sph", "og.cyl", "og.axis", "og.add",
      "fieldValues.ep_re", "fieldValues.doctor_name", "fieldValues.distance",
    ]);
  });

  it("formats the display number like the database", () => {
    expect(displayNumber("CNT", "", 832, 5)).toBe("CNT-00832");
    expect(displayNumber("CNT", "B", 1, 5)).toBe("CNT-B-00001");
    expect(displayNumber("CNT", "", 1234567, 5)).toBe("CNT-1234567");
  });
});

describe("form messages", () => {
  it("every key used by the form schema exists in French and English", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const fr = (await import("../../../../messages/fr.json")).default as Record<string, unknown>;
    const en = (await import("../../../../messages/en.json")).default as Record<string, unknown>;
    const source = readFileSync(join(__dirname, "form.ts"), "utf8");
    const keys = [...source.matchAll(/t\("([a-zA-Z]+(?:\.[a-zA-Z]+)+)"/g)].map((m) => m[1]);
    const lookup = (messages: Record<string, unknown>, key: string) => key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], messages);
    expect(keys.length).toBeGreaterThan(8);
    for (const key of keys) {
      expect(lookup(fr, key), `fr ${key}`).toBeTypeOf("string");
      expect(lookup(en, key), `en ${key}`).toBeTypeOf("string");
    }
    for (const code of ["sphRange", "cylRange", "addRange", "axisRange", "axisRequired", "step"]) {
      expect(lookup(fr, `rx.errors.${code}`), code).toBeTypeOf("string");
    }
  });
});
