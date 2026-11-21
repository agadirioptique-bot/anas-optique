import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/features/auth/guards";
import { getVisibleStores } from "@/features/auth/session";
import { getPendingChargeCount } from "@/features/charges/queries";
import { getUnreadCount } from "@/features/notifications/queries";
import { getWhatsappTemplates } from "@/features/settings/whatsapp/queries";
import { getActiveStore } from "@/features/shell/store-scope";
import { getWorkshopBadgeCount } from "@/features/workshop/queries";

/** Shell for signed-in pages. Each page also runs its own guard (`userPage` / `superAdminPage`). */
export default async function AppLayout({ children }: LayoutProps<"/[locale]">) {
  const user = await requireUser();
  const stores = await getVisibleStores(user);
  const activeStore = await getActiveStore(user, stores);
  // Sidebar badges (SPEC §11), super admin only: workshop queue in the top-bar store, pending charges.
  const badges =
    user.role === "super_admin"
      ? await Promise.all([getWorkshopBadgeCount(activeStore === "all" ? null : activeStore), getPendingChargeCount()]).then(([workshop, charges]) => ({
          workshop,
          charges,
        }))
      : {};

  const [unreadNotifications, whatsappTemplates] = await Promise.all([getUnreadCount(), getWhatsappTemplates()]);

  return <AppShell value={{ user, stores, activeStore, badges, unreadNotifications, whatsappTemplates }}>{children}</AppShell>;
}
