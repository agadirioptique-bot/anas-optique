"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { authErrorCode, fail, ok, type ActionResult } from "@/lib/errors";
import { homePath } from "@/lib/permissions";
import { siteUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { forgotPasswordSchema, setPasswordSchema, signInSchema } from "./schemas";
import { getSessionUser } from "./session";

/** Email + password. Returns the home path; inactive or profile-less accounts are signed out again. */
export async function signIn(input: unknown): Promise<ActionResult<{ home: string }>> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return fail("invalidInput");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return fail(authErrorCode(error));

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

/** Sends the reset email. Same answer whether or not the account exists (no account enumeration). */
export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("invalidInput");

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/confirm`,
  });
  if (error && authErrorCode(error) === "rateLimited") return fail("rateLimited");
  return ok(undefined);
}

/** After an invite or recovery link: the session exists, the user picks a password. */
export async function setPassword(input: unknown): Promise<ActionResult<{ home: string }>> {
  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("invalidInput");

  const user = await getSessionUser();
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
