import { describe, expect, it } from "vitest";
import { otpTypeSchema, safeConfirmNext, setPasswordSchema, signInSchema } from "./schemas";

describe("signInSchema", () => {
  it("trims and lower-cases the email", () => {
    expect(signInSchema.parse({ email: "  Salma@Example.MA ", password: "x" }).email).toBe("salma@example.ma");
  });
  it("rejects an invalid email or an empty password", () => {
    expect(signInSchema.safeParse({ email: "salma", password: "x" }).success).toBe(false);
    expect(signInSchema.safeParse({ email: "s@example.ma", password: "" }).success).toBe(false);
  });
});

describe("setPasswordSchema", () => {
  it("needs 8 characters and a matching confirmation", () => {
    expect(setPasswordSchema.safeParse({ password: "short", confirm: "short" }).success).toBe(false);
    expect(setPasswordSchema.safeParse({ password: "longenough", confirm: "different1" }).success).toBe(false);
    expect(setPasswordSchema.safeParse({ password: "longenough", confirm: "longenough" }).success).toBe(true);
  });
});

describe("/auth/confirm parameters", () => {
  it("accepts only invite and recovery links", () => {
    expect(otpTypeSchema.safeParse("invite").success).toBe(true);
    expect(otpTypeSchema.safeParse("recovery").success).toBe(true);
    expect(otpTypeSchema.safeParse("signup").success).toBe(false);
    expect(otpTypeSchema.safeParse("email_change").success).toBe(false);
  });
  it("never redirects outside the allow-list", () => {
    expect(safeConfirmNext("/set-password")).toBe("/set-password");
    expect(safeConfirmNext("https://evil.example")).toBe("/set-password");
    expect(safeConfirmNext("//evil.example")).toBe("/set-password");
    expect(safeConfirmNext("/dashboard")).toBe("/set-password");
    expect(safeConfirmNext(null)).toBe("/set-password");
  });
});
