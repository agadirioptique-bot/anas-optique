/**
 * Error codes returned by Server Actions; each one has a message in `messages/*.json` → `errors.<code>`.
 * Database functions raise `OPTICOR:SOME_CODE`; Supabase Auth errors carry a `code`.
 * Never show raw SQL / auth messages to the user.
 */

export const ERROR_CODES = [
  // generic
  "unexpected",
  "invalidInput",
  // auth
  "invalidCredentials",
  "accountDisabled",
  "rateLimited",
  "weakPassword",
  "samePassword",
  "sessionExpired",
  "emailExists",
  "alreadyActive",
  "linkInvalid",
  // database (OPTICOR:*)
  "forbidden",
  "notFound",
  "selfChange",
  "lastSuperAdmin",
  "secretaryStoreInvalid",
  "noStock",
  "duplicateSlip",
  "phoneExists",
  "phoneInvalid",
  "requiredFieldMissing",
  "invalidPrescription",
  "totalBelowItems",
  "noPendingDiscount",
  "discountTooHigh",
  "discountAlreadyApplied",
  "amountTooHigh",
  "invalidStatusChange",
  "balanceDue",
  "prefixLocked",
  "orderStoreInvalid",
  "frameRule",
  "chargeReadOnly",
  "configMissing",
  // Postgres constraints (mapped per action)
  "duplicateName",
  "prefixTaken",
  "labExists",
  "inUse",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ErrorCode };

export const ok = <T>(data: T): { ok: true; data: T } => ({ ok: true, data });
export const fail = (error: ErrorCode): { ok: false; error: ErrorCode } => ({ ok: false, error });

function isErrorCode(value: string): value is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value);
}

/**
 * "OPTICOR:LAST_SUPER_ADMIN" anywhere in the message → "lastSuperAdmin". Constraint errors:
 * unique violation → `onUnique` (e.g. "prefixTaken"), still referenced → "inUse", no privilege → "forbidden".
 * Unknown → "unexpected".
 */
export function dbErrorCode(
  error: { message?: string; code?: string } | null | undefined,
  options: { onUnique?: ErrorCode } = {},
): ErrorCode {
  if (error?.code === "23505") return options.onUnique ?? "duplicateName";
  if (error?.code === "23503") return "inUse";
  if (error?.code === "42501") return "forbidden";
  const match = error?.message?.match(/OPTICOR:([A-Z_]+)/);
  if (!match) return "unexpected";
  const camel = match[1].toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  return isErrorCode(camel) ? camel : "unexpected";
}

const AUTH_CODES: Record<string, ErrorCode> = {
  invalid_credentials: "invalidCredentials",
  user_banned: "accountDisabled",
  email_not_confirmed: "invalidCredentials",
  over_request_rate_limit: "rateLimited",
  over_email_send_rate_limit: "rateLimited",
  weak_password: "weakPassword",
  same_password: "samePassword",
  session_not_found: "sessionExpired",
  session_expired: "sessionExpired",
  refresh_token_not_found: "sessionExpired",
  email_exists: "emailExists",
  user_already_exists: "emailExists",
  otp_expired: "sessionExpired",
};

/** Supabase Auth error → error code. */
export function authErrorCode(error: { code?: string; status?: number } | null | undefined): ErrorCode {
  if (error?.code && AUTH_CODES[error.code]) return AUTH_CODES[error.code];
  if (error?.status === 429) return "rateLimited";
  return "unexpected";
}
