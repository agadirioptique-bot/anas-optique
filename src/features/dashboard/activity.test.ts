import { describe, expect, it } from "vitest";
import { addDays, calendarColumns, dayLevels, isoWeek, isoWeekday, upcomingMonths, viewRange, weekLevel, weekRanges, type KpiActivity } from "./activity";

describe("activity calendar", () => {
  it("dates: days, weekday (Monday = 1), ISO week", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(isoWeekday("2026-11-23")).toBe(1);
    expect(isoWeekday("2026-11-29")).toBe(7);
    expect(isoWeek("2026-11-24")).toBe(48);
    expect(isoWeek("2027-01-01")).toBe(53); // Friday: still the last week of 2026
    expect(isoWeek("2027-01-04")).toBe(1);
    expect(isoWeek("2020-12-31")).toBe(53);
  });

  it("views: the last 12 months up to today, or a whole year", () => {
    expect(viewRange("last12", "2026-11-24")).toEqual({ from: "2025-11-25", to: "2026-11-24" });
    expect(viewRange(2022, "2026-11-24")).toEqual({ from: "2022-01-01", to: "2022-12-31" });
  });

  it("grid: weeks Monday → Sunday, days outside the range or after today are empty", () => {
    const { columns, months } = calendarColumns("2026-01-01", "2026-12-31", "2026-11-24");
    expect(columns).toHaveLength(53);
    expect(columns[0].start).toBe("2025-12-29");
    expect(columns[0].days).toEqual([null, null, null, "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"]);
    const now = columns.find((c) => c.start === "2026-11-23")!;
    expect(now.days).toEqual(["2026-11-23", "2026-11-24", null, null, null, null, null]);
    expect(columns.at(-1)!.days.every((d) => d === null)).toBe(true);
    expect(months.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(months[0].col).toBe(0);
  });

  it("grid: a month label too close to the next one is dropped", () => {
    const { months } = calendarColumns("2025-11-25", "2026-11-24", "2026-11-24");
    expect(months[0]).toEqual({ col: 1, month: 12 }); // November had a single column
  });

  it("levels: 0 without orders, then quartiles of the days with orders", () => {
    const level = dayLevels([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(level)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(dayLevels([1, 1, 1])(1)).toBe(1);
    expect(dayLevels([])(3)).toBe(4);
  });

  const upcoming: KpiActivity["upcoming"] = [
    { start: "2026-11-23", week: 48, index: 1, level: "normal" },
    { start: "2026-11-30", week: 49, index: 0.6, level: "calm" },
    { start: "2026-12-07", week: 50, index: 0.4, level: "calm" },
    { start: "2026-12-14", week: 51, index: 1.5, level: "busy" },
    { start: "2026-12-21", week: 52, index: 0.5, level: "calm" },
  ];

  it("periods: consecutive weeks of one level are merged", () => {
    expect(weekRanges(upcoming, "calm")).toEqual([
      { start: "2026-11-30", end: "2026-12-13", weeks: 2, index: 0.5 },
      { start: "2026-12-21", end: "2026-12-27", weeks: 1, index: 0.5 },
    ]);
    expect(weekRanges(upcoming, "busy")).toEqual([{ start: "2026-12-14", end: "2026-12-20", weeks: 1, index: 1.5 }]);
  });

  it("months: the 12 months from the current one", () => {
    const months: KpiActivity["months"] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, index: 1 + i / 10, level: i === 8 ? "busy" : "normal" }));
    const next = upcomingMonths(months, "2026-11-24");
    expect(next.map((m) => `${m.year}-${m.month}`)).toEqual(["2026-11", "2026-12", "2027-1", "2027-2", "2027-3", "2027-4", "2027-5", "2027-6", "2027-7", "2027-8", "2027-9", "2027-10"]);
    expect(next[10]).toEqual({ year: 2027, month: 9, index: 1.8, level: "busy" });
    expect(upcomingMonths([], "2026-11-24")).toEqual([]);
  });

  it("week level of a date: ISO week, 53 joins 52", () => {
    const weeks: KpiActivity["weeks"] = Array.from({ length: 52 }, (_, i) => ({ week: i + 1, index: 1, level: i === 51 ? "calm" : "normal" }));
    expect(weekLevel(weeks, "2020-12-28")).toBe("calm"); // week 53
    expect(weekLevel(weeks, "2026-11-23")).toBe("normal");
    expect(weekLevel([], "2026-11-23")).toBeNull();
  });
});
