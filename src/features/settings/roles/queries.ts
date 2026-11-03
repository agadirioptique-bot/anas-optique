import "server-only";
import { createClient } from "@/lib/supabase/server";

/** role → permission keys ("domain.action"), from role_permissions (SPEC §3). */
export async function getRolePermissions(): Promise<Record<string, string[]>> {
  const db = await createClient();
  const { data, error } = await db.from("role_permissions").select("role, permission").order("permission");
  if (error) throw new Error("role_permissions failed");
  const byRole: Record<string, string[]> = {};
  for (const row of data) (byRole[row.role] ??= []).push(row.permission);
  return byRole;
}
