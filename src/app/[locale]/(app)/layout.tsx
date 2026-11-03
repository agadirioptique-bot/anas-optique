import { AppShell } from "@/components/layout/app-shell";
import { getSessionUser, getVisibleStores } from "@/features/auth/session";
import { isDevFakeAuth } from "@/features/dev/flags";
import { getActiveStore } from "@/features/shell/store-scope";
import { redirect } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

export default async function AppLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  const user = await getSessionUser();
  if (!user) return redirect({ href: "/login", locale: locale as AppLocale });
  const stores = await getVisibleStores(user);
  const activeStore = await getActiveStore(user, stores);

  return <AppShell value={{ user, stores, activeStore, devFakeAuth: isDevFakeAuth() }}>{children}</AppShell>;
}
