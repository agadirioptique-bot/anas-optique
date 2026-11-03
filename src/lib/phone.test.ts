import { describe, expect, it } from "vitest";
import { formatPhone, formatPhoneTyping, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("accepts the ways people type a Moroccan number", () => {
    for (const input of ["06 12 34 56 78", "0612345678", "06.12.34.56.78", "+212 6 12 34 56 78", "00212612345678", "212612345678", "612345678"]) {
      expect(normalizePhone(input), input).toBe("+212612345678");
    }
    expect(normalizePhone("0522 12 34 56")).toBe("+212522123456");
  });

  it("keeps foreign numbers in E.164", () => {
    expect(normalizePhone("+33 6 12 34 56 78")).toBe("+33612345678");
  });

  it("rejects what is not a phone", () => {
    for (const input of ["", "abc", "0812345678", "06123", "+2126123456789", null, undefined]) {
      expect(normalizePhone(input), String(input)).toBeNull();
    }
  });
});

describe("formatPhone", () => {
  it("shows Moroccan numbers the local way", () => {
    expect(formatPhone("+212612345678")).toBe("06 12 34 56 78");
    expect(formatPhone("+33612345678")).toBe("+33612345678");
    expect(formatPhone(null)).toBe("");
  });
});

describe("formatPhoneTyping", () => {
  it("groups digits by two while typing", () => {
    expect(formatPhoneTyping("0612")).toBe("06 12");
    expect(formatPhoneTyping("06 12 34 56 789")).toBe("06 12 34 56 78");
    expect(formatPhoneTyping("+33 6 12")).toBe("+33 6 12");
  });
});
