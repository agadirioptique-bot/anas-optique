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
