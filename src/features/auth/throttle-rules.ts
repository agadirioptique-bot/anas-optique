/**
 * Brute-force limits for the signed-out auth actions (SPEC §4). Pure rules; the database calls are
 * in `throttle.ts`. Sign-in counts failed passwords only (a successful sign-in costs nothing);
 * password reset counts every request (each one may send an email).
 */

export type ThrottleAction = "signIn" | "reset";

export const THROTTLE_WINDOW_SECONDS = 15 * 60;

export const THROTTLE_LIMITS: Record<ThrottleAction, { ip: number; email: number }> = {
  // Per IP is looser: a shop's computers share one public IP.
  signIn: { ip: 30, email: 10 },
  reset: { ip: 10, email: 3 },
};

export interface ThrottleKey {
  key: string;
  limit: number;
}

/** One key per client IP and one per email, both already hashed (no raw IP or email is stored). */
export function throttleKeys(action: ThrottleAction, ipHash: string, emailHash: string): ThrottleKey[] {
  const limits = THROTTLE_LIMITS[action];
  return [
    { key: `${action}:ip:${ipHash}`, limit: limits.ip },
    { key: `${action}:email:${emailHash}`, limit: limits.email },
  ];
}

/** Blocked as soon as one key has used up its limit. */
export function isOverLimit(keys: ThrottleKey[], counts: { key: string; attempts: number }[]): boolean {
  return keys.some(({ key, limit }) => (counts.find((c) => c.key === key)?.attempts ?? 0) >= limit);
}

/**
 * The visitor's IP. On Vercel `x-real-ip` / `x-forwarded-for` are set by the platform (a client
 * can't spoof them); elsewhere, the per-email limit still applies.
 */
export function clientIp(headers: { get(name: string): string | null }): string {
  return headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
