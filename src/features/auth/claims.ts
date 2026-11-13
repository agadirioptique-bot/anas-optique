/**
 * The JWT carries `app_role` and `store_id` from the access-token hook. When a super admin changes a
 * user's role or store, the user's sessions are revoked and the database stops trusting the old
 * token (auth_role / auth_store_id must match the live profile, SPEC §4). The app must stop
 * trusting it too, or the user stays "signed in" on empty pages until the token expires.
 */
export function claimsMatchProfile(
  claims: { [claim: string]: unknown },
  profile: { role: string; store_id: string | null },
): boolean {
  return claims.app_role === profile.role && (claims.store_id || null) === profile.store_id;
}

/**
 * Sign-in methods (JWT `amr`) that prove the user holds the mailbox. Supabase records the
 * token-hash links of /auth/confirm (invite, reset) as `otp` (seen on dev, 2026-11-13); the other
 * names are kept in case Auth reports the link type itself.
 */
const EMAIL_LINK_METHODS = new Set(["invite", "recovery", "otp", "magiclink", "email/signup"]);

/** How long after opening the email link the password can be chosen (= the link's own lifetime). */
export const PASSWORD_LINK_MAX_AGE_SECONDS = 60 * 60;

/**
 * Choosing a password needs a session opened by an invite or reset link within the hour, not just
 * any session: otherwise anyone at a signed-in, unattended computer could change the password
 * without knowing it and take the account over (SPEC §4).
 */
export function canSetPassword(claims: { amr?: unknown }, nowSeconds: number): boolean {
  if (!Array.isArray(claims.amr)) return false;
  return claims.amr.some((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    return (
      typeof method === "string" &&
      EMAIL_LINK_METHODS.has(method) &&
      typeof timestamp === "number" &&
      nowSeconds - timestamp <= PASSWORD_LINK_MAX_AGE_SECONDS
    );
  });
}
