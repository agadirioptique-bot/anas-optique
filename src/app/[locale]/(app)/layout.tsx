import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/features/auth/guards";
import { getVisibleStores } from "@/features/auth/session";
import { getPendingChargeCount } from "@/features/charges/queries";
import { getActiveStore } from "@/features/shell/store-scope";

/** Shell for signed-in pages. Each page also runs its own guard (`userPage` / `superAdminPage`). */
export default async function AppLayout({ children }: LayoutProps<"/[locale]">) {
  const user = await requireUser();
  const stores = await getVisibleStores(user);
  const activeStore = await getActiveStore(user, stores);
  // Charges badge (SPEC §11): super admin only — charges are invisible to secretaries anyway.
  const badges = user.role === "super_admin" ? { charges: await getPendingChargeCount() } : {};

  return <AppShell value={{ user, stores, activeStore, badges }}>{children}</AppShell>;
}
