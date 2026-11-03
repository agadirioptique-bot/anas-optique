import { describe, expect, it } from "vitest";
import { clientSchema, directorySearchSchema, discountSchema } from "./schemas";

const ID = "a75dbe63-27ca-40ce-be75-108492cfe040";

describe("clientSchema", () => {
  it("normalises the phone and empties notes", () => {
    expect(clientSchema.parse({ fullName: " Salma Idrissi ", phone: "06 12 34 56 78", hasWhatsapp: true, notes: " " })).toEqual({
      fullName: "Salma Idrissi",
      phone: "+212612345678",
      hasWhatsapp: true,
      notes: null,
    });
  });

  it("rejects a bad phone or a too short name", () => {
    expect(clientSchema.safeParse({ fullName: "Salma", phone: "0612", hasWhatsapp: true, notes: "" }).success).toBe(false);
    expect(clientSchema.safeParse({ fullName: "S", phone: "0612345678", hasWhatsapp: true, notes: "" }).success).toBe(false);
  });
});

describe("discountSchema", () => {
  it("caps percentages at 100", () => {
    expect(discountSchema.safeParse({ clientId: ID, type: "percent", value: 10 }).success).toBe(true);
    expect(discountSchema.safeParse({ clientId: ID, type: "percent", value: 120 }).success).toBe(false);
    expect(discountSchema.safeParse({ clientId: ID, type: "amount", value: 150 }).success).toBe(true);
    expect(discountSchema.safeParse({ clientId: ID, type: "amount", value: 0 }).success).toBe(false);
  });
});

describe("directorySearchSchema", () => {
  it("falls back to defaults for unknown URL values", () => {
    expect(directorySearchSchema.parse({ segment: "vip", sort: "x", limit: "9999" })).toEqual({ q: "", segment: "all", sort: "recent", limit: 50 });
    expect(directorySearchSchema.parse({ q: "ben", segment: "loyal", sort: "name", limit: "100" })).toEqual({ q: "ben", segment: "loyal", sort: "name", limit: 100 });
  });
});
