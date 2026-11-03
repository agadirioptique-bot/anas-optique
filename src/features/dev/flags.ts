import "server-only";

/** Fake sign-in for phase 1. Never active in a production build. */
export function isDevFakeAuth(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.OPTICOR_DEV_FAKE_AUTH === "1";
}

export const DEV_ROLE_COOKIE = "opticor-dev-role";
/** Cookie value meaning "signed out" in fake-auth mode. */
export const DEV_SIGNED_OUT = "signed_out";
