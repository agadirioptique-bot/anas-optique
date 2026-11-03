import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import fr from "../../messages/fr.json";
import en from "../../messages/en.json";
import { authErrorCode, dbErrorCode, ERROR_CODES } from "./errors";

describe("dbErrorCode", () => {
  it("maps OPTICOR codes to camelCase error codes", () => {
    expect(dbErrorCode({ message: "OPTICOR:LAST_SUPER_ADMIN" })).toBe("lastSuperAdmin");
    expect(dbErrorCode({ message: "ERROR: OPTICOR:SECRETARY_STORE_INVALID (P0001)" })).toBe("secretaryStoreInvalid");
  });

  it("never leaks unknown database messages", () => {
    expect(dbErrorCode({ message: 'duplicate key value violates unique constraint "profiles_email_key"' })).toBe("unexpected");
    expect(dbErrorCode({ message: "OPTICOR:SOMETHING_NEW" })).toBe("unexpected");
    expect(dbErrorCode(null)).toBe("unexpected");
  });
});

describe("database error codes", () => {
  it("every OPTICOR code raised by a migration has a translated error code", () => {
    const dir = join(__dirname, "../../supabase/migrations");
    const sql = readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
    const codes = [...new Set(sql.match(/OPTICOR:[A-Z_]+/g))];
    expect(codes.length).toBeGreaterThan(10);
    for (const code of codes) expect(dbErrorCode({ message: code }), code).not.toBe("unexpected");
  });
});

describe("authErrorCode", () => {
  it("maps Supabase Auth codes", () => {
    expect(authErrorCode({ code: "invalid_credentials" })).toBe("invalidCredentials");
    expect(authErrorCode({ code: "user_banned" })).toBe("accountDisabled");
    expect(authErrorCode({ code: "weak_password" })).toBe("weakPassword");
    expect(authErrorCode({ status: 429 })).toBe("rateLimited");
    expect(authErrorCode({ code: "whatever" })).toBe("unexpected");
  });
});

describe("error messages", () => {
  it("exist in French and English for every code", () => {
    for (const code of ERROR_CODES) {
      expect(fr.errors[code], `fr ${code}`).toBeTruthy();
      expect(en.errors[code], `en ${code}`).toBeTruthy();
    }
  });
});
