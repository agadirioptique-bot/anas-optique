import { describe, expect, it } from "vitest";
import { adjustSchema, damageSchema, stockSearchSchema, transferSchema } from "./schemas";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("stock schemas", () => {
  it("transfer: distinct locations, unique categories, positive quantities", () => {
    expect(transferSchema.safeParse({ fromStoreId: A, toStoreId: B, lines: [{ categoryId: C, qty: 2 }] }).success).toBe(true);
    expect(transferSchema.safeParse({ fromStoreId: A, toStoreId: A, lines: [{ categoryId: C, qty: 2 }] }).success).toBe(false);
    expect(transferSchema.safeParse({ fromStoreId: A, toStoreId: B, lines: [] }).success).toBe(false);
    expect(transferSchema.safeParse({ fromStoreId: A, toStoreId: B, lines: [{ categoryId: C, qty: 0 }] }).success).toBe(false);
    expect(
      transferSchema.safeParse({
        fromStoreId: A,
        toStoreId: B,
        lines: [
          { categoryId: C, qty: 1 },
          { categoryId: C, qty: 1 },
        ],
      }).success,
    ).toBe(false);
  });

  it("damage: reason required after trimming", () => {
    expect(damageSchema.safeParse({ storeId: A, categoryId: C, qty: 1, reason: "Cassée" }).success).toBe(true);
    expect(damageSchema.safeParse({ storeId: A, categoryId: C, qty: 1, reason: "   " }).success).toBe(false);
    expect(damageSchema.safeParse({ storeId: A, categoryId: C, qty: -1, reason: "x" }).success).toBe(false);
  });

  it("adjust: counted ≥ 0 and a reason", () => {
    expect(adjustSchema.safeParse({ storeId: A, categoryId: C, counted: 0, reasonId: B }).success).toBe(true);
    expect(adjustSchema.safeParse({ storeId: A, categoryId: C, counted: -1, reasonId: B }).success).toBe(false);
    expect(adjustSchema.safeParse({ storeId: A, categoryId: C, counted: 1.5, reasonId: B }).success).toBe(false);
    expect(adjustSchema.safeParse({ storeId: A, categoryId: C, counted: 3 }).success).toBe(false);
  });

  it("an invalid ?location= is ignored", () => {
    expect(stockSearchSchema.parse({ location: "nope" })).toEqual({ location: undefined });
    expect(stockSearchSchema.parse({ location: A })).toEqual({ location: A });
  });
});
