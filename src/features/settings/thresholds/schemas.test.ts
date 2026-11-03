import { describe, expect, it } from "vitest";
import { loyaltySchema, stuckDaysSchema } from "./schemas";

describe("threshold schemas", () => {
  it("loyalty needs a whole number of orders ≥ 1", () => {
    expect(loyaltySchema.safeParse({ orders: 5 }).success).toBe(true);
    expect(loyaltySchema.safeParse({ orders: 0 }).success).toBe(false);
    expect(loyaltySchema.safeParse({ orders: 2.5 }).success).toBe(false);
  });

  it("stuck-order days are 1–60 for each status", () => {
    expect(stuckDaysSchema.safeParse({ confirmed: 3, in_workshop: 5, prepared: 3, in_store: 10 }).success).toBe(true);
    expect(stuckDaysSchema.safeParse({ confirmed: 0, in_workshop: 5, prepared: 3, in_store: 10 }).success).toBe(false);
    expect(stuckDaysSchema.safeParse({ confirmed: 3, in_workshop: 5, prepared: 3 }).success).toBe(false);
  });
});
