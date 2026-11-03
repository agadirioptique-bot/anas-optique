import { describe, expect, it } from "vitest";
import { chargeHistory, periodRange } from "./lib";

describe("periodRange", () => {
  it("month, last month (across a year), year", () => {
    expect(periodRange("month", "2026-02-14")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange("month", "2028-02-14")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(periodRange("lastMonth", "2026-01-10")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(periodRange("year", "2026-11-03")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("custom uses its bounds, or the month when they are missing or reversed", () => {
    expect(periodRange("custom", "2026-11-03", { from: "2026-10-05", to: "2026-10-20" })).toEqual({ from: "2026-10-05", to: "2026-10-20" });
    expect(periodRange("custom", "2026-11-03", { from: "2026-10-20", to: "2026-10-05" })).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(periodRange("custom", "2026-11-03", { from: "2026-10-05" })).toEqual({ from: "2026-11-01", to: "2026-11-30" });
  });
});

describe("chargeHistory", () => {
  const base = { amount: 100, charge_date: "2026-11-01", category_id: "c", location_id: "l", reason: "Loyer", order_id: null, status: "pending", is_deleted: false };

  it("turns audit rows into created / approved / edited / deleted / restored events", () => {
    const events = chargeHistory([
      { action: "update", at: "2026-11-02T10:00:00Z", actor: "a", old: base, new: { ...base, status: "approved", amount: 120 } },
      { action: "insert", at: "2026-11-01T05:00:00Z", actor: null, old: null, new: base },
      { action: "update", at: "2026-11-03T10:00:00Z", actor: "a", old: { ...base, status: "approved" }, new: { ...base, status: "approved", is_deleted: true } },
      { action: "update", at: "2026-11-04T10:00:00Z", actor: "b", old: { ...base, is_deleted: true }, new: { ...base, reason: "Loyer novembre" } },
    ]);
    expect(events.map((e) => e.kind)).toEqual(["created", "approved", "edited", "deleted", "restored", "edited"]);
    expect(events[2]).toMatchObject({ kind: "edited", changes: [{ field: "amount", from: 100, to: 120 }] });
    expect(events[5]).toMatchObject({ actor: "b", changes: [{ field: "reason", from: "Loyer", to: "Loyer novembre" }] });
  });

  it("ignores bookkeeping-only updates", () => {
    expect(chargeHistory([{ action: "update", at: "x", actor: "a", old: base, new: { ...base, updated_at: "later" } }])).toEqual([]);
  });
});
