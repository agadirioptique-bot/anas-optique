import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { authCookieOptions, supabaseAnonKey, supabaseUrl } from "./env";

/** Browser Supabase client (signed-in user, RLS applies). */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey(), { cookieOptions: authCookieOptions });
}
