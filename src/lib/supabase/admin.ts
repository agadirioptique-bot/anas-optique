import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { supabaseUrl } from "./env";

/**
 * Service role client: bypasses RLS. Server only, and only after the caller has been checked
 * as a super admin (inviting users, banning). The only place that reads SUPABASE_SERVICE_ROLE_KEY.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing environment variable SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
