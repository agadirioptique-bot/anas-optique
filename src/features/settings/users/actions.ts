"use server";

import { getSuperAdmin } from "@/features/auth/guards";
import { authErrorCode, dbErrorCode, fail, ok, type ActionResult } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { inviteUserSchema, resendInviteSchema, setUserWhatsappSchema, updateUserAccessSchema } from "./schemas";

/** Long enough to mean "until reactivated". */
const BAN_FOREVER = "876000h";

/** Is this an active store (never the lab)? Read as the signed-in super admin (RLS). */
async function isActiveStore(storeId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("stores").select("id").eq("id", storeId).eq("kind", "store").eq("is_active", true).maybeSingle();
  return !!data;
}

/**
 * Settings › Users › Invite: sends the invitation email and creates the profile.
 * If the profile can't be created, the new auth user is deleted so nothing is left half-done.
 */
export async function inviteUser(input: unknown): Promise<ActionResult> {
  if (!(await getSuperAdmin())) return fail("forbidden");
  const parsed = inviteUserSchema.safeParse(input);
  if (!parsed.success) return fail("invalidInput");
  const { fullName, email, role, storeId } = parsed.data;
  if (storeId && !(await isActiveStore(storeId))) return fail("secretaryStoreInvalid");

  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) return fail("emailExists");

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, role, store_id: storeId },
    redirectTo: `${siteUrl()}/auth/confirm`,
  });
  if (error || !data.user) return fail(authErrorCode(error));

  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: data.user.id, full_name: fullName, email, role, store_id: storeId });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return fail(dbErrorCode(profileError));
  }
  return ok(undefined);
}

/** Sends the invitation again, only while the user has not accepted it. */
export async function resendInvite(input: unknown): Promise<ActionResult> {
  if (!(await getSuperAdmin())) return fail("forbidden");
  const parsed = resendInviteSchema.safeParse(input);
  if (!parsed.success) return fail("invalidInput");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(parsed.data.userId);
  if (error || !data.user?.email) return fail("notFound");
  if (data.user.email_confirmed_at) return fail("alreadyActive");

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(data.user.email, {
    data: data.user.user_metadata,
    redirectTo: `${siteUrl()}/auth/confirm`,
  });
  return inviteError ? fail(authErrorCode(inviteError)) : ok(undefined);
}

/**
 * Role / store / active. The RPC checks the caller, refuses self-changes and removing the last
 * super admin, and revokes the user's sessions; a deactivated account is also banned in Auth.
 */
export async function updateUserAccess(input: unknown): Promise<ActionResult> {
  if (!(await getSuperAdmin())) return fail("forbidden");
  const parsed = updateUserAccessSchema.safeParse(input);
  if (!parsed.success) return fail("invalidInput");
  const { userId, role, storeId, isActive } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_user_access", {
    p_user_id: userId,
    p_role: role,
    // Generated types don't mark RPC args nullable; the function accepts null for super admins.
    p_store_id: storeId as string,
    p_is_active: isActive,
  });
  if (error) return fail(dbErrorCode(error));

  const { error: banError } = await createAdminClient().auth.admin.updateUserById(userId, {
    ban_duration: isActive ? "none" : BAN_FOREVER,
  });
  return banError ? fail(authErrorCode(banError)) : ok(undefined);
}

/** WhatsApp number of an account (super admin only, checked again by `set_user_whatsapp`). */
export async function setUserWhatsapp(input: unknown): Promise<ActionResult<{ whatsapp: string | null }>> {
  if (!(await getSuperAdmin())) return fail("forbidden");
  const parsed = setUserWhatsappSchema.safeParse(input);
  if (!parsed.success) return fail("phoneInvalid");
  const { userId, phone } = parsed.data;
  const { error } = await (await createClient()).rpc("set_user_whatsapp", {
    p_user_id: userId,
    // Generated types don't mark RPC args nullable; null clears the number.
    p_phone: phone as string,
  });
  return error ? fail(dbErrorCode(error)) : ok({ whatsapp: phone });
}
