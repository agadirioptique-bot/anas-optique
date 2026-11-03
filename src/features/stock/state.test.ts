import { describe, expect, it } from "vitest";
import { isLowStock, stockState } from "./state";

describe("stock state", () => {
  it("colours the quantity pill against the threshold", () => {
    expect(stockState(0, null)).toBe("none");
    expect(stockState(1, 3)).toBe("below");
    expect(stockState(3, 3)).toBe("atMin");
    expect(stockState(0, 0)).toBe("atMin");
    expect(stockState(4, 3)).toBe("ok");
  });

  it("low stock = at or below the minimum, only with a threshold", () => {
    expect(isLowStock(0, null)).toBe(false);
    expect(isLowStock(3, 3)).toBe(true);
    expect(isLowStock(2, 3)).toBe(true);
    expect(isLowStock(4, 3)).toBe(false);
  });
});
