import { describe, expect, it } from "vitest";
import { isLate, progress, workshopSummary } from "./lib";

const now = new Date("2026-11-04T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000 - 60_000).toISOString();
const stuck = { confirmed: 3, in_workshop: 5, prepared: 3 };

describe("workshop", () => {
  it("late = more days in the current status than its setting; no setting → never late", () => {
    expect(isLate({ status: "confirmed", createdAt: ago(9), statusSince: ago(3) }, stuck, now)).toBe(false);
    expect(isLate({ status: "confirmed", createdAt: ago(9), statusSince: ago(4) }, stuck, now)).toBe(true);
    expect(isLate({ status: "in_workshop", createdAt: ago(9), statusSince: ago(5) }, stuck, now)).toBe(false);
    expect(isLate({ status: "in_workshop", createdAt: ago(9), statusSince: ago(6) }, stuck, now)).toBe(true);
    expect(isLate({ status: "prepared", createdAt: ago(30), statusSince: ago(30) }, {}, now)).toBe(false);
  });

  it("progress turns amber on the last allowed day and red after", () => {
    expect(progress({ status: "confirmed", createdAt: ago(0), statusSince: ago(0) }, stuck, now)).toEqual({ ratio: 0.25, tone: "ok" });
    expect(progress({ status: "confirmed", createdAt: ago(3), statusSince: ago(3) }, stuck, now)).toEqual({ ratio: 1, tone: "soon" });
    expect(progress({ status: "confirmed", createdAt: ago(8), statusSince: ago(8) }, stuck, now)).toEqual({ ratio: 1, tone: "late" });
    expect(progress({ status: "confirmed", createdAt: ago(8), statusSince: ago(8) }, {}, now)).toEqual({ ratio: 0, tone: "ok" });
  });

  it("summary: count, average age since creation, late, per step", () => {
    const summary = workshopSummary(
      [
        { status: "confirmed", createdAt: ago(1), statusSince: ago(1) },
        { status: "confirmed", createdAt: ago(5), statusSince: ago(5) },
        { status: "in_workshop", createdAt: ago(6), statusSince: ago(2) },
        { status: "prepared", createdAt: ago(10), statusSince: ago(4) },
      ],
      stuck,
      now,
    );
    expect(summary).toEqual({ total: 4, averageAge: 6, late: 2, byStatus: { confirmed: 2, in_workshop: 1, prepared: 1 } });
    expect(workshopSummary([], stuck, now)).toEqual({ total: 0, averageAge: 0, late: 0, byStatus: { confirmed: 0, in_workshop: 0, prepared: 0 } });
  });
});
