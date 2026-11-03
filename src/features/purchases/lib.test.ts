import { describe, expect, it } from "vitest";
import { lineTotal, percentOf, purchaseTotal, todayIso } from "./lib";

describe("purchase money", () => {
  it("line and purchase totals are exact to the cent", () => {
    expect(lineTotal({ kind: "stock", unitPrice: 123.45, qty: 3 })).toBe(370.35);
    expect(lineTotal({ kind: "lens", amount: 864.12 })).toBe(864.12);
    expect(lineTotal({ kind: "stock", unitPrice: undefined, qty: 2 })).toBe(0);
    expect(
      purchaseTotal([
        { kind: "stock", unitPrice: 0.1, qty: 3 },
        { kind: "lens", amount: 0.2 },
      ]),
    ).toBe(0.5);
  });

  it("payment chips round to the cent; 100 % is exactly the total", () => {
    expect(percentOf(1234.57, 30)).toBe(370.37);
    expect(percentOf(1234.57, 50)).toBe(617.29);
    expect(percentOf(1234.57, 100)).toBe(1234.57);
    expect(percentOf(0.01, 30)).toBe(0);
  });

  it("today in the local calendar", () => {
    expect(todayIso(new Date(2026, 10, 3, 23, 30))).toBe("2026-11-03");
  });
});
