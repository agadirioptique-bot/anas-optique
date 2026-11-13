/** Public Supabase settings (safe in the browser). The service role key is read only in `admin.ts`. */

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

// Literal `process.env.NEXT_PUBLIC_*` accesses so Next inlines them in client bundles.
export const supabaseUrl = () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const supabaseAnonKey = () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export const siteUrl = () => required("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL).replace(/\/+$/, "");

/**
 * Session cookies, for the server, proxy and browser clients alike: whole site, SameSite=Lax (the
 * @supabase/ssr defaults, spelled out) and HTTPS-only in production builds. Browsers accept Secure
 * cookies on http://localhost, so a local `next start` still works.
 */
export const authCookieOptions = {
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
} as const;
