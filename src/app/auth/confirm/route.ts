import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { otpTypeSchema, safeConfirmNext } from "@/features/auth/schemas";
import { routing } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";

/**
 * Invite and password-reset links (token-hash flow, SPEC §4):
 * /auth/confirm?token_hash=…&type=invite|recovery&next=/set-password
 * Verifies the link, stores the session cookies, then opens set-password in the user's language.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = otpTypeSchema.safeParse(params.get("type"));
  const next = safeConfirmNext(params.get("next"));

  let target = `/${routing.defaultLocale}/login?error=linkInvalid`;
  if (tokenHash && type.success) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type: type.data, token_hash: tokenHash });
    if (!error && data.user) {
      const { data: profile } = await supabase.from("profiles").select("locale").eq("id", data.user.id).maybeSingle();
      target = `/${profile?.locale ?? routing.defaultLocale}${next}`;
    }
  }
  redirect(target);
}
