import { describe, expect, it } from "vitest";
import { comparisonRange, percentDelta, periodRange, shiftMonths } from "./periods";
import { dashboardSearchSchema } from "./schemas";

describe("dashboard periods", () => {
  const today = "2026-11-04";

  it("presets", () => {
    expect(periodRange("today", today)).toEqual({ from: today, to: today });
    expect(periodRange("last7", today)).toEqual({ from: "2026-10-29", to: today });
    expect(periodRange("thisMonth", today)).toEqual({ from: "2026-11-01", to: today });
    expect(periodRange("lastMonth", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodRange("lastMonth", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(periodRange("thisYear", today)).toEqual({ from: "2026-01-01", to: today });
    expect(periodRange("custom", today, { from: "2026-09-10", to: "2026-09-20" })).toEqual({ from: "2026-09-10", to: "2026-09-20" });
    expect(periodRange("custom", today, { from: "2026-09-20", to: "2026-09-10" })).toEqual({ from: "2026-11-01", to: today });
  });

  it("months shift clamps to the last day", () => {
    expect(shiftMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftMonths("2028-03-31", -1)).toBe("2028-02-29");
    expect(shiftMonths("2026-01-15", -1)).toBe("2025-12-15");
    expect(shiftMonths("2028-02-29", -12)).toBe("2027-02-28");
  });

  it("comparison: M−1 / Y−1, whole months stay whole, none", () => {
    expect(comparisonRange({ from: "2026-11-01", to: "2026-11-04" }, "m1")).toEqual({ from: "2026-10-01", to: "2026-10-04" });
    expect(comparisonRange({ from: "2026-10-01", to: "2026-10-31" }, "m1")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(comparisonRange({ from: "2026-09-01", to: "2026-09-30" }, "m1")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(comparisonRange({ from: "2026-11-04", to: "2026-11-04" }, "y1")).toEqual({ from: "2025-11-04", to: "2025-11-04" });
    expect(comparisonRange({ from: "2026-11-01", to: "2026-11-04" }, "none")).toBeNull();
  });

  it("delta: relative change, null without a base", () => {
    expect(percentDelta(120, 100)).toBeCloseTo(0.2);
    expect(percentDelta(80, -100)).toBeCloseTo(1.8);
    expect(percentDelta(50, 0)).toBeNull();
    expect(percentDelta(50, null)).toBeNull();
  });

  it("URL filters fall back to defaults", () => {
    expect(dashboardSearchSchema.parse({ period: "decade", compare: "x", store: "nope" })).toEqual({
      period: "thisMonth",
      compare: "m1",
      store: undefined,
      from: undefined,
      to: undefined,
    });
    expect(dashboardSearchSchema.parse({ store: "all" }).store).toBe("all");
  });
});
