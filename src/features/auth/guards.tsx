import "server-only";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import type { ComponentType } from "react";
import { AccessDenied } from "@/components/layout/access-denied";
import { getSessionUser } from "./session";
import type { SessionUser } from "./types";

/**
 * Signed-in, active user — or out to the login page. Goes through /auth/sign-out so a session whose
 * profile was deactivated is cleared (Server Components can't clear cookies).
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/auth/sign-out?locale=${await getLocale()}`);
  return user;
}

/** For Server Actions: the super admin, or null (the action then returns `forbidden`). */
export async function getSuperAdmin(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user?.role === "super_admin" ? user : null;
}

/**
 * Wraps every signed-in page. Layouts don't re-render on client navigation, so the active-account
 * check must run in each page too (else a deactivated user keeps clicking around until a refresh).
 */
export function userPage<P extends object>(Page: ComponentType<P>) {
  return async function UserPage(props: P) {
    await requireUser();
    return <Page {...props} />;
  };
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
