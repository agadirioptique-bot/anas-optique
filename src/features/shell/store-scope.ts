import "server-only";
import { cookies } from "next/headers";
import type { SessionUser, StoreSummary } from "@/features/auth/types";

export const STORE_COOKIE = "opticor-store";

/** Super admin: "all" or one store/lab id from the cookie. Secretary: always her store. */
export async function getActiveStore(user: SessionUser, stores: StoreSummary[]): Promise<string> {
  if (user.role !== "super_admin") return user.storeId ?? "all";
  const value = (await cookies()).get(STORE_COOKIE)?.value;
  return value && stores.some((s) => s.id === value) ? value : "all";
}
