import { describe, expect, it } from "vitest";
import { paymentSchema, purchaseSchema, purchasesSearchSchema, supplierSchema } from "./schemas";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

const base = { supplierId: A, receiveStoreId: B, purchaseDate: "2026-11-01" };

describe("purchase schemas", () => {
  it("accepts stock and lens lines with an optional payment", () => {
    const ok = purchaseSchema.safeParse({
      ...base,
      lines: [
        { kind: "stock", categoryId: C, unitPrice: 120, qty: 5 },
        { kind: "lens", description: "Verres progressifs", amount: 900 },
      ],
      payment: { amount: 300, methodId: A, paidAt: "2026-11-01" },
    });
    expect(ok.success).toBe(true);
  });

  it("rejects empty lines, a category twice, blank lens text, bad quantities and future dates", () => {
    expect(purchaseSchema.safeParse({ ...base, lines: [] }).success).toBe(false);
    expect(
      purchaseSchema.safeParse({
        ...base,
        lines: [
          { kind: "stock", categoryId: C, unitPrice: 1, qty: 1 },
          { kind: "stock", categoryId: C, unitPrice: 2, qty: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(purchaseSchema.safeParse({ ...base, lines: [{ kind: "lens", description: "  ", amount: 1 }] }).success).toBe(false);
    expect(purchaseSchema.safeParse({ ...base, lines: [{ kind: "stock", categoryId: C, unitPrice: 1, qty: 0 }] }).success).toBe(false);
    expect(purchaseSchema.safeParse({ ...base, lines: [{ kind: "stock", categoryId: C, unitPrice: -1, qty: 1 }] }).success).toBe(false);
    expect(purchaseSchema.safeParse({ ...base, purchaseDate: "2099-01-01", lines: [{ kind: "lens", description: "x", amount: 1 }] }).success).toBe(false);
  });

  it("payment amount must be positive", () => {
    expect(paymentSchema.safeParse({ purchaseId: A, amount: 0, paidAt: "2026-11-01", methodId: B }).success).toBe(false);
    expect(paymentSchema.safeParse({ purchaseId: A, amount: 10.5, paidAt: "2026-11-01", methodId: B }).success).toBe(true);
  });

  it("supplier name is required", () => {
    expect(supplierSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(supplierSchema.safeParse({ name: "Essilor", phone: "0522 00 00 00" }).success).toBe(true);
  });

  it("unknown ?tab= falls back to purchases", () => {
    expect(purchasesSearchSchema.parse({ tab: "x" })).toEqual({ tab: "purchases" });
    expect(purchasesSearchSchema.parse({})).toEqual({ tab: "purchases" });
  });
});
