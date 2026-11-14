"use server";

import { getSessionUser } from "@/features/auth/session";
import { dbErrorCode, fail, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export interface AdminContact {
  id: string;
  name: string;
  /** E.164 */
  whatsapp: string;
}

/** Active super admins with a WhatsApp number, never the caller (`admin_contacts`, any role). No input. */
export async function loadAdminContacts(): Promise<ActionResult<AdminContact[]>> {
  if (!(await getSessionUser())) return fail("forbidden");
  const { data, error } = await (await createClient()).rpc("admin_contacts");
  if (error) return fail(dbErrorCode(error));
  return ok(data.map((c) => ({ id: c.id, name: c.full_name, whatsapp: c.whatsapp_e164 })));
}
