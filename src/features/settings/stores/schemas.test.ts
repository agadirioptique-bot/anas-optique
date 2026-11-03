import { describe, expect, it } from "vitest";
import { createStoreSchema } from "./schemas";

describe("createStoreSchema", () => {
  it("upper-cases the prefix and normalises the phone", () => {
    const parsed = createStoreSchema.parse({ name: "Succursale Agdal", kind: "store", prefix: " agd ", address: "", phone: "05 37 12 34 56" });
    expect(parsed).toEqual({ name: "Succursale Agdal", kind: "store", prefix: "AGD", address: null, phone: "+212537123456" });
  });

  it("rejects bad prefixes and phones", () => {
    const base = { name: "Agdal", kind: "store", address: "", phone: "" };
    for (const prefix of ["A", "ABCDEF", "AB1", "A-B"]) {
      expect(createStoreSchema.safeParse({ ...base, prefix }).success, prefix).toBe(false);
    }
    expect(createStoreSchema.safeParse({ ...base, prefix: "AGD", phone: "12" }).success).toBe(false);
    expect(createStoreSchema.safeParse({ ...base, prefix: "AGD" }).data?.phone).toBeNull();
  });
});
