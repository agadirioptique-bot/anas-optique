import { describe, expect, it } from "vitest";
import { formatAxis, formatDiopter, formatMoney, initials, parseDecimal, parseMoney } from "./format";

describe("parseMoney", () => {
  it("reads French and English amounts", () => {
    expect(parseMoney("1 200,50", "fr")).toBe(1200.5);
    expect(parseMoney("1.200,50 DH", "fr")).toBe(1200.5);
    expect(parseMoney("1,200.50", "en")).toBe(1200.5);
    expect(parseMoney("300", "fr")).toBe(300);
    expect(parseMoney("", "fr")).toBeNull();
    expect(parseMoney("1,2,3x", "fr")).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formats with the DH suffix", () => {
    expect(formatMoney(1200.5, "fr")).toBe("1\u00a0200,5\u00a0DH");
    expect(formatMoney(1250, "en")).toBe("DH\u00a01,250");
    expect(formatMoney(-150, "fr")).toBe("\u2212150\u00a0DH");
  });
});

describe("initials", () => {
  it("takes first and last name", () => {
    expect(initials("Salma Bennani")).toBe("SB");
  });
});

describe("prescription values", () => {
  it("use optician notation", () => {
    expect(formatDiopter(-1.25)).toBe("\u22121.25");
    expect(formatDiopter(0.5)).toBe("+0.50");
    expect(formatDiopter(0)).toBe("0.00");
    expect(formatDiopter(null)).toBe("—");
    expect(formatAxis(90)).toBe("90°");
  });

  it("read what people type", () => {
    expect(parseDecimal("-0,75")).toBe(-0.75);
    expect(parseDecimal("\u22122")).toBe(-2);
    expect(parseDecimal("+")).toBeNull();
    expect(parseDecimal("1.2.3")).toBeNull();
  });
});
