import { describe, expect, it } from "vitest";
import { canSetPassword, claimsMatchProfile, PASSWORD_LINK_MAX_AGE_SECONDS } from "./claims";

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

describe("canSetPassword", () => {
  const now = 1_800_000_000;

  it("accepts a session opened by an invite or reset link within the hour", () => {
    expect(canSetPassword({ amr: [{ method: "invite", timestamp: now - 60 }] }, now)).toBe(true);
    expect(canSetPassword({ amr: [{ method: "recovery", timestamp: now - PASSWORD_LINK_MAX_AGE_SECONDS }] }, now)).toBe(true);
  });

  it("refuses a password session: changing the password then needs a reset link", () => {
    expect(canSetPassword({ amr: [{ method: "password", timestamp: now - 10 }] }, now)).toBe(false);
  });

  it("refuses an email link opened more than an hour ago", () => {
    expect(canSetPassword({ amr: [{ method: "recovery", timestamp: now - PASSWORD_LINK_MAX_AGE_SECONDS - 1 }] }, now)).toBe(false);
  });

  it("refuses missing or malformed amr claims", () => {
    expect(canSetPassword({}, now)).toBe(false);
    expect(canSetPassword({ amr: "recovery" }, now)).toBe(false);
    expect(canSetPassword({ amr: [null, { method: "recovery" }, { method: "recovery", timestamp: "1" }] }, now)).toBe(false);
  });
});
