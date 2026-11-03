import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/features/auth/guards";
import { getVisibleStores } from "@/features/auth/session";
import { getActiveStore } from "@/features/shell/store-scope";

/** Shell for signed-in pages. Each page also runs its own guard (`userPage` / `superAdminPage`). */
export default async function AppLayout({ children }: LayoutProps<"/[locale]">) {
  const user = await requireUser();
  const stores = await getVisibleStores(user);
  const activeStore = await getActiveStore(user, stores);

  return <AppShell value={{ user, stores, activeStore }}>{children}</AppShell>;
}
