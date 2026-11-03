import { AccessDenied } from "@/components/layout/access-denied";
import { requireUser } from "@/features/auth/guards";

/**
 * Super admin pages (SPEC §3): others see Access denied. Each page also runs `superAdminPage`,
 * since a layout doesn't re-run on client navigation. The database enforces the same rule.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.role !== "super_admin") return <AccessDenied role={user.role} />;
  return children;
}
