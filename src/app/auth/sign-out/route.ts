import { hasLocale } from "next-intl";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/features/auth/session";
import { routing } from "@/i18n/routing";
import { homePath } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * Clears a session that no longer maps to an active profile (deactivated or profile-less user),
 * then shows the login page with "account disabled". Server Components can't clear cookies, so the
 * app layout sends such users here. An active user is never signed out by this GET.
 */
export async function GET(request: NextRequest) {
  const param = request.nextUrl.searchParams.get("locale");
  const locale = hasLocale(routing.locales, param) ? param : routing.defaultLocale;

  const user = await getSessionUser();
  if (user) redirect(`/${locale}${homePath(user.role)}`);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(`/${locale}/login`);

  await supabase.auth.signOut({ scope: "local" });
  redirect(`/${locale}/login?error=accountDisabled`);
}
