import { describe, expect, it } from "vitest";
import { chargeFiltersSchema, chargeSchema, recurringSchema } from "./schemas";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("charge schemas", () => {
  it("a charge needs a positive amount, a reason and no future date", () => {
    const ok = { amount: 250, chargeDate: "2026-11-01", categoryId: A, locationId: B, reason: "Loyer" };
    expect(chargeSchema.safeParse(ok).success).toBe(true);
    expect(chargeSchema.safeParse({ ...ok, orderId: A }).success).toBe(true);
    expect(chargeSchema.safeParse({ ...ok, reason: "   " }).success).toBe(false);
    expect(chargeSchema.safeParse({ ...ok, amount: 0 }).success).toBe(false);
    expect(chargeSchema.safeParse({ ...ok, chargeDate: "2099-01-01" }).success).toBe(false);
  });

  it("recurring day of month is 1..28", () => {
    const ok = { label: "Loyer", amount: 4000, categoryId: A, locationId: B, dayOfMonth: 5 };
    expect(recurringSchema.safeParse(ok).success).toBe(true);
    expect(recurringSchema.safeParse({ ...ok, dayOfMonth: 31 }).success).toBe(false);
  });

  it("URL filters fall back to defaults", () => {
    expect(chargeFiltersSchema.parse({ period: "decade", status: "x", location: "nope" })).toEqual({
      tab: "charges",
      period: "month",
      status: "all",
      deleted: "0",
      from: undefined,
      to: undefined,
      location: undefined,
      category: undefined,
    });
  });
});
