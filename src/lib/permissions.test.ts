import { describe, expect, it } from "vitest";
import { canAccessRoute, homePath, isAppRole, isNavActive, NAV_ITEMS, visibleNav } from "./permissions";

const SECRETARY_ALLOWED = ["/orders", "/orders/new", "/orders/abc-123", "/clients", "/clients/42", "/stock", "/notifications"];
const ADMIN_ONLY = ["/dashboard", "/workshop", "/purchases", "/charges", "/settings", "/stock/transfers", "/settings/users"];

describe("canAccessRoute", () => {
  it("lets a secretary open only Orders, Clients, Stock, New order and Notifications", () => {
    for (const path of SECRETARY_ALLOWED) expect(canAccessRoute("secretary", path), path).toBe(true);
    for (const path of ADMIN_ONLY) expect(canAccessRoute("secretary", path), path).toBe(false);
  });

  it("ignores a trailing slash", () => {
    expect(canAccessRoute("secretary", "/orders/")).toBe(true);
    expect(canAccessRoute("secretary", "/dashboard/")).toBe(false);
  });

  it("lets a super admin open everything", () => {
    for (const path of [...SECRETARY_ALLOWED, ...ADMIN_ONLY]) expect(canAccessRoute("super_admin", path), path).toBe(true);
  });

  it("denies everything without a role", () => {
    expect(canAccessRoute(null, "/orders")).toBe(false);
  });
});

describe("visibleNav", () => {
  it("shows the secretary Orders, Clients and Stock", () => {
    expect(visibleNav("secretary").map((i) => i.key)).toEqual(["orders", "clients", "stock"]);
  });

  it("shows the super admin every page", () => {
    expect(visibleNav("super_admin")).toEqual(NAV_ITEMS);
  });
});

describe("homePath", () => {
  it("sends each role to its home", () => {
    expect(homePath("super_admin")).toBe("/dashboard");
    expect(homePath("secretary")).toBe("/orders");
    expect(homePath(null)).toBe("/login");
  });
});

describe("isAppRole", () => {
  it("accepts only the two roles", () => {
    expect(isAppRole("secretary")).toBe(true);
    expect(isAppRole("super_admin")).toBe(true);
    expect(isAppRole("admin")).toBe(false);
    expect(isAppRole(undefined)).toBe(false);
  });
});

describe("isNavActive", () => {
  it("keeps Orders active on an order detail but not on New order", () => {
    expect(isNavActive("/orders/123", "/orders")).toBe(true);
    expect(isNavActive("/orders/new", "/orders")).toBe(false);
    expect(isNavActive("/stock/transfers", "/stock")).toBe(true);
  });
});
