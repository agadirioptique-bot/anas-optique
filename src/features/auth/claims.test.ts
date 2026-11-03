import { describe, expect, it } from "vitest";
import { claimsMatchProfile } from "./claims";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("claimsMatchProfile", () => {
  it("accepts a token that matches the live profile", () => {
    expect(claimsMatchProfile({ app_role: "secretary", store_id: A }, { role: "secretary", store_id: A })).toBe(true);
    expect(claimsMatchProfile({ app_role: "super_admin", store_id: null }, { role: "super_admin", store_id: null })).toBe(true);
    expect(claimsMatchProfile({ app_role: "super_admin", store_id: "" }, { role: "super_admin", store_id: null })).toBe(true);
  });

  it("rejects a token issued before a store or role change", () => {
    expect(claimsMatchProfile({ app_role: "secretary", store_id: B }, { role: "secretary", store_id: A })).toBe(false);
    expect(claimsMatchProfile({ app_role: "secretary", store_id: A }, { role: "super_admin", store_id: null })).toBe(false);
    expect(claimsMatchProfile({}, { role: "secretary", store_id: A })).toBe(false);
  });
});
