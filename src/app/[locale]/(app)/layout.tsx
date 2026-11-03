import { AppShell } from "@/components/layout/app-shell";
import { getSessionUser, getVisibleStores } from "@/features/auth/session";
import { getActiveStore } from "@/features/shell/store-scope";
import { redirect } from "next/navigation";

export default async function AppLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  const user = await getSessionUser();
  // The proxy already sent visitors without a session to /login: a session without an active
  // profile (deactivated user) gets its cookies cleared, else /login ↔ /orders would loop.
  if (!user) redirect(`/auth/sign-out?locale=${locale}`);
  const stores = await getVisibleStores(user);
  const activeStore = await getActiveStore(user, stores);

  return <AppShell value={{ user, stores, activeStore }}>{children}</AppShell>;
}
