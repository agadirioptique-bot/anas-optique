import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { claimsMatchProfile } from "./claims";
import type { SessionUser, StoreSummary } from "./types";

/**
 * The signed-in user, or null (no session, no profile, deactivated, or a token issued before the
 * user's role/store changed — the database denies that token, see `claimsMatchProfile`).
 * The JWT is verified by `getClaims()`; role/store come from the live profile row.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, store_id, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || !profile.is_active || !claimsMatchProfile(data.claims, profile)) return null;

  return {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    role: profile.role,
    storeId: profile.store_id,
  };
});

/** Active stores and lab the user can see (secretary: only her store). RLS scopes the query too. */
export const getVisibleStores = cache(async (user: SessionUser): Promise<StoreSummary[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stores")
    .select("id, name, kind, prefix")
    .eq("is_active", true)
    .order("kind")
    .order("name");
  const stores = data ?? [];
  return user.role === "super_admin" ? stores : stores.filter((s) => s.id === user.storeId);
});
