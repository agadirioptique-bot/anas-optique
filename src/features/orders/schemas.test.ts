import { describe, expect, it } from "vitest";
import { cancelSchema, changeStatusSchema, deliverSchema, orderListFiltersSchema } from "./schemas";

const ID = "a75dbe63-27ca-40ce-be75-108492cfe040";

describe("order action schemas", () => {
  it("never move to cancelled through a status change", () => {
    expect(changeStatusSchema.safeParse({ orderId: ID, to: "in_workshop" }).success).toBe(true);
    expect(changeStatusSchema.safeParse({ orderId: ID, to: "cancelled" }).success).toBe(false);
  });

  it("need a method for a refund or a final payment", () => {
    expect(cancelSchema.safeParse({ orderId: ID, reasonId: ID, refundAmount: 100, refundMethodId: null }).success).toBe(false);
    expect(cancelSchema.safeParse({ orderId: ID, reasonId: ID, refundAmount: 0, refundMethodId: null }).success).toBe(true);
    expect(deliverSchema.safeParse({ orderId: ID, payment: { amount: 0, methodId: ID } }).success).toBe(false);
    expect(deliverSchema.safeParse({ orderId: ID, payment: null }).success).toBe(true);
  });

  it("read board/list filters from the URL with safe defaults", () => {
    expect(orderListFiltersSchema.parse({})).toEqual({ view: "board", status: "all", period: "any", q: "" });
    expect(orderListFiltersSchema.parse({ view: "list", status: "delivered", period: "30", q: " HIS-00250 " })).toEqual({ view: "list", status: "delivered", period: "30", q: "HIS-00250" });
    expect(orderListFiltersSchema.parse({ view: "x", status: "y", period: "z", q: ["a", "b"] })).toEqual({ view: "board", status: "all", period: "any", q: "" });
  });
});
