/**
 * Role → navigation and route access (UI only; the database enforces the real rules).
 * Paths are locale-less, e.g. "/orders/123".
 */

export const ROLES = ["super_admin", "secretary"] as const;
export type AppRole = (typeof ROLES)[number];

export type NavKey =
  | "dashboard"
  | "orders"
  | "workshop"
  | "clients"
  | "stock"
  | "purchases"
  | "charges"
  | "settings";

export const NAV_ITEMS: { key: NavKey; href: string }[] = [
  { key: "dashboard", href: "/dashboard" },
  { key: "orders", href: "/orders" },
  { key: "workshop", href: "/workshop" },
  { key: "clients", href: "/clients" },
  { key: "stock", href: "/stock" },
  { key: "purchases", href: "/purchases" },
  { key: "charges", href: "/charges" },
  { key: "settings", href: "/settings" },
];

/** Routes a secretary may open (SPEC §3). Everything else is super admin only. */
const SECRETARY_ROUTES: RegExp[] = [
  /^\/orders$/,
  /^\/orders\/new$/,
  /^\/orders\/[^/]+$/,
  /^\/clients$/,
  /^\/clients\/[^/]+$/,
  /^\/stock$/,
  /^\/notifications$/,
];

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function canAccessRoute(role: AppRole | null, path: string): boolean {
  if (!role) return false;
  if (role === "super_admin") return true;
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return SECRETARY_ROUTES.some((re) => re.test(clean));
}

export function visibleNav(role: AppRole | null) {
  return NAV_ITEMS.filter((item) => canAccessRoute(role, item.href));
}

/** Where a user lands after sign-in. */
export function homePath(role: AppRole | null): string {
  if (role === "super_admin") return "/dashboard";
  if (role === "secretary") return "/orders";
  return "/login";
}

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/orders") return pathname === "/orders" || (/^\/orders\/[^/]+$/.test(pathname) && pathname !== "/orders/new");
  return pathname === href || pathname.startsWith(href + "/");
}
