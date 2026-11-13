"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { authErrorCode, fail, ok, type ActionResult } from "@/lib/errors";
import { homePath } from "@/lib/permissions";
import { siteUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { forgotPasswordSchema, setPasswordSchema, signInSchema } from "./schemas";
import { getPasswordSetupUser } from "./session";
import { authThrottle } from "./throttle";

/**
 * Email + password. Returns the home path; inactive or profile-less accounts are signed out again.
 * Too many wrong passwords for this email or from this IP → `rateLimited` (throttle-rules.ts).
 */
export async function signIn(input: unknown): Promise<ActionResult<{ home: string }>> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return fail("invalidInput");

  const throttle = await authThrottle("signIn", parsed.data.email);
  if (await throttle.blocked()) return fail("rateLimited");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "invalid_credentials") await throttle.record();
    return fail(authErrorCode(error));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return fail("accountDisabled");
  }
  return ok({ home: homePath(profile.role) });
}

/**
 * Sends the reset email. Same answer whether or not the account exists (no account enumeration).
 * Limited per email and per IP, so nobody can flood a mailbox or use up the project's email quota.
 */
export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("invalidInput");

  const throttle = await authThrottle("reset", parsed.data.email);
  if (await throttle.blocked()) return fail("rateLimited");
  await throttle.record();

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/confirm`,
  });
  if (error && authErrorCode(error) === "rateLimited") return fail("rateLimited");
  return ok(undefined);
}

/**
 * After an invite or recovery link: the user picks a password. Only a session opened by such a
 * link within the hour may do it (`canSetPassword`), never a plain signed-in session.
 */
export async function setPassword(input: unknown): Promise<ActionResult<{ home: string }>> {
  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("invalidInput");

  const user = await getPasswordSetupUser();
  if (!user) return fail("sessionExpired");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(authErrorCode(error));
  return ok({ home: homePath(user.role) });
}

export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirect({ href: "/login", locale: await getLocale() });
}
