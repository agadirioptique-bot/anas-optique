import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { DEV_STORES, DEV_USERS } from "@/features/dev/fixtures";
import { DEV_ROLE_COOKIE, DEV_SIGNED_OUT, isDevFakeAuth } from "@/features/dev/flags";
import { isAppRole } from "@/lib/permissions";
import type { SessionUser, StoreSummary } from "./types";

/**
 * The signed-in user, or null. Phase 1: fake user from a dev cookie (only with OPTICOR_DEV_FAKE_AUTH=1).
 * Phase 3 replaces the body with Supabase Auth + profiles; callers stay the same.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (!isDevFakeAuth()) return null;
  const value = (await cookies()).get(DEV_ROLE_COOKIE)?.value;
  if (value === DEV_SIGNED_OUT) return null;
  return DEV_USERS[isAppRole(value) ? value : "super_admin"];
});

/** Active stores and lab the user can see (secretary: only her store). */
export const getVisibleStores = cache(async (user: SessionUser): Promise<StoreSummary[]> => {
  if (!isDevFakeAuth()) return [];
  return user.role === "super_admin" ? DEV_STORES : DEV_STORES.filter((s) => s.id === user.storeId);
});
