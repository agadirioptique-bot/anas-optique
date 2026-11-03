import "server-only";
import { getLocale } from "next-intl/server";
import type { ComponentType } from "react";
import { AccessDenied } from "@/components/layout/access-denied";
import { redirect } from "@/i18n/navigation";
import { getSessionUser } from "./session";
import type { SessionUser } from "./types";

/** Signed-in user, or redirect to the login page. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) return redirect({ href: "/login", locale: await getLocale() });
  return user;
}

/** For Server Actions: the super admin, or null (the action then returns `forbidden`). */
export async function getSuperAdmin(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user?.role === "super_admin" ? user : null;
}

/**
 * Wraps a super-admin-only page: other roles get Access denied and the page never renders.
 * Layout checks alone are not enough (a layout doesn't stop its page from rendering).
 */
export function superAdminPage<P extends object>(Page: ComponentType<P>) {
  return async function SuperAdminPage(props: P) {
    const user = await requireUser();
    if (user.role !== "super_admin") return <AccessDenied role={user.role} />;
    return <Page {...props} />;
  };
}
