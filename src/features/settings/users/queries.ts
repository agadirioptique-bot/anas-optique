import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/permissions";

export type UserStatus = "active" | "invited" | "disabled";

export interface UserRow {
  id: string;
  fullName: string;
  email: string;
  role: AppRole;
  storeId: string | null;
  isActive: boolean;
  status: UserStatus;
  /** E.164; secretaries notify active super admins on this number (admin_contacts). */
  whatsapp: string | null;
}

/** All users with their invitation status (super admin only — checked by `admin_list_users`). */
export async function listUsers(): Promise<UserRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users");
  if (error) throw new Error("admin_list_users failed");
  return data.map((u) => ({
    id: u.id,
    fullName: u.full_name,
    email: u.email,
    role: u.role,
    storeId: u.store_id,
    isActive: u.is_active,
    status: !u.is_active ? "disabled" : u.email_confirmed_at ? "active" : "invited",
    whatsapp: u.whatsapp_e164,
  }));
}
