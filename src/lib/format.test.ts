import { describe, expect, it } from "vitest";
import { formatMoney, initials, parseMoney } from "./format";

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
    expect(formatMoney(1200.5, "fr")).toBe("1 200,5 DH");
    expect(formatMoney(1200.5, "en")).toBe("1,200.5 DH");
  });
});

describe("initials", () => {
  it("takes first and last name", () => {
    expect(initials("Salma Bennani")).toBe("SB");
  });
});
