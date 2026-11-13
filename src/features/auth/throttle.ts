import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, isOverLimit, THROTTLE_WINDOW_SECONDS, throttleKeys, type ThrottleAction } from "./throttle-rules";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Attempt counter for a signed-out auth action (rules in `throttle-rules.ts`). Stored by the database
 * (`auth_attempt_counts` / `auth_record_attempt`, service role only). If the database can't be
 * reached the attempt is allowed (fail open: Supabase Auth's own limits still apply) and logged.
 */
export async function authThrottle(action: ThrottleAction, email: string) {
  const keys = throttleKeys(action, hash(clientIp(await headers())), hash(email.trim().toLowerCase()));

  return {
    async blocked(): Promise<boolean> {
      try {
        const { data, error } = await createAdminClient().rpc("auth_attempt_counts", {
          p_keys: keys.map((k) => k.key),
          p_window_seconds: THROTTLE_WINDOW_SECONDS,
        });
        if (error) throw error;
        return isOverLimit(keys, data ?? []);
      } catch (error) {
        console.error("auth throttle unavailable", error);
        return false;
      }
    },
    async record(): Promise<void> {
      try {
        const { error } = await createAdminClient().rpc("auth_record_attempt", { p_keys: keys.map((k) => k.key) });
        if (error) throw error;
      } catch (error) {
        console.error("auth throttle unavailable", error);
      }
    },
  };
}
