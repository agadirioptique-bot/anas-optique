import { createServerClient } from "@supabase/ssr";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { supabaseAnonKey, supabaseUrl } from "./lib/supabase/env";
import { homePath, isAppRole } from "./lib/permissions";

const intlMiddleware = createMiddleware(routing);

/** Pages reachable without a session (locale-less). Set password needs one, but the page checks it. */
const PUBLIC_PATHS = ["/login", "/forgot-password", "/set-password"];
/** Signed-in users are sent home from these. */
const GUEST_ONLY_PATHS = ["/login", "/forgot-password"];

type CookieToSet = { name: string; value: string; options: Parameters<NextResponse["cookies"]["set"]>[2] };

/**
 * 1. Refresh the Supabase session (cookies written to the request for Server Components and to the response).
 * 2. next-intl locale routing.
 * 3. Optimistic redirects from the JWT claims. Real checks: server guards + RLS.
 */
export default async function proxy(request: NextRequest) {
  const pending: CookieToSet[] = [];
  const pendingHeaders: Record<string, string> = {};

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          pending.push({ name, value, options });
        });
        Object.assign(pendingHeaders, headers);
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const withSession = (response: NextResponse) => {
    pending.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    Object.entries(pendingHeaders).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  };

  const response = intlMiddleware(request);
  // Locale redirect ("/orders" → "/fr/orders"): the next request does the auth checks.
  if (response.headers.has("location")) return withSession(response);

  const [, maybeLocale, ...rest] = request.nextUrl.pathname.split("/");
  const locale = (routing.locales as readonly string[]).includes(maybeLocale) ? maybeLocale : routing.defaultLocale;
  const path = "/" + rest.join("/").replace(/\/+$/, "");

  const redirectTo = (href: string) => {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${href}`;
    url.search = "";
    return withSession(NextResponse.redirect(url));
  };

  if (!claims && !PUBLIC_PATHS.includes(path)) return redirectTo("/login");
  const role = claims?.app_role;
  if (claims && isAppRole(role) && GUEST_ONLY_PATHS.includes(path)) return redirectTo(homePath(role));

  return withSession(response);
}

export const config = {
  // Everything except API routes, the auth callback, Next internals and static files.
  matcher: "/((?!api|auth|trpc|_next|_vercel|.*\\..*).*)",
};
