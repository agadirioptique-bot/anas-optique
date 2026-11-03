"use server";

import { cookies } from "next/headers";
import { getSessionUser, getVisibleStores } from "@/features/auth/session";
import { activeStoreSchema } from "./schemas";
import { STORE_COOKIE } from "./store-scope";

type Result = { ok: true } | { ok: false };

/** Super admin top-bar store selector: "all" or one visible store/lab. */
export async function setActiveStore(input: unknown): Promise<Result> {
  const parsed = activeStoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") return { ok: false };
  const value = parsed.data;
  if (value !== "all") {
    const stores = await getVisibleStores(user);
    if (!stores.some((s) => s.id === value)) return { ok: false };
  }
  (await cookies()).set(STORE_COOKIE, value, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  return { ok: true };
}
