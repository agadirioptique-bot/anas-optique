import { hasLocale } from "next-intl";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/features/auth/session";
import { routing } from "@/i18n/routing";
import { homePath } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * Clears a session that no longer maps to an active profile (deactivated or profile-less user), or
 * whose token predates a role/store change, then shows the login page with "account disabled" or
 * "session expired". Server Components can't clear cookies, so the app layout sends such users
 * here. A valid session is never signed out by this GET.
 */
export async function GET(request: NextRequest) {
  const param = request.nextUrl.searchParams.get("locale");
  const locale = hasLocale(routing.locales, param) ? param : routing.defaultLocale;

  const user = await getSessionUser();
  if (user) redirect(`/${locale}${homePath(user.role)}`);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(`/${locale}/login`);

  // Still active → the admin changed the role/store: sign in again for a token with the new access.
  const { data: profile } = await supabase.from("profiles").select("is_active").eq("id", data.claims.sub).maybeSingle();
  await supabase.auth.signOut({ scope: "local" });
  redirect(`/${locale}/login?error=${profile?.is_active ? "sessionExpired" : "accountDisabled"}`);
}
