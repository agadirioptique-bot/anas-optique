import { AccessDenied } from "@/components/layout/access-denied";
import { getSessionUser } from "@/features/auth/session";

/** Super admin pages (SPEC §3). Others see Access denied. The database enforces the same rule. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (user.role !== "super_admin") return <AccessDenied role={user.role} />;
  return children;
}
