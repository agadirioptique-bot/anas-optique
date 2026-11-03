import { describe, expect, it } from "vitest";
import { inviteUserSchema, updateUserAccessSchema } from "./schemas";

const STORE = "a75dbe63-27ca-40ce-be75-108492cfe040";
const USER = "5f2b8f0e-7c1a-4b5e-9a39-0d6a1f9b2c11";

describe("inviteUserSchema", () => {
  it("normalises the email and requires a store for a secretary", () => {
    const ok = inviteUserSchema.parse({ fullName: " Salma Bennani ", email: " Salma@Example.MA ", role: "secretary", storeId: STORE });
    expect(ok).toEqual({ fullName: "Salma Bennani", email: "salma@example.ma", role: "secretary", storeId: STORE });
    expect(inviteUserSchema.safeParse({ fullName: "Salma", email: "s@example.ma", role: "secretary", storeId: null }).success).toBe(false);
  });

  it("drops the store of a super admin", () => {
    const ok = inviteUserSchema.parse({ fullName: "Ali Akouhar", email: "ali@example.ma", role: "super_admin", storeId: STORE });
    expect(ok.storeId).toBeNull();
  });

  it("rejects bad input", () => {
    expect(inviteUserSchema.safeParse({ fullName: "A", email: "x@example.ma", role: "secretary", storeId: STORE }).success).toBe(false);
    expect(inviteUserSchema.safeParse({ fullName: "Salma", email: "not-an-email", role: "secretary", storeId: STORE }).success).toBe(false);
    expect(inviteUserSchema.safeParse({ fullName: "Salma", email: "s@example.ma", role: "owner", storeId: STORE }).success).toBe(false);
    expect(inviteUserSchema.safeParse({ fullName: "Salma", email: "s@example.ma", role: "secretary", storeId: "CNT" }).success).toBe(false);
  });
});

describe("updateUserAccessSchema", () => {
  it("requires a store for a secretary", () => {
    expect(updateUserAccessSchema.safeParse({ userId: USER, role: "secretary", storeId: null, isActive: true }).success).toBe(false);
    expect(updateUserAccessSchema.parse({ userId: USER, role: "super_admin", storeId: STORE, isActive: false }).storeId).toBeNull();
  });
});
