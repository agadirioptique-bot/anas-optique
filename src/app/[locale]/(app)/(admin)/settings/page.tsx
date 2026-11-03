import { useTranslations } from "next-intl";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { pageMetadata } from "@/components/shared/placeholder-page";
import { Card } from "@/components/ui/card";
import { requireUser, superAdminPage } from "@/features/auth/guards";
import { getVisibleStores } from "@/features/auth/session";
import { isSettingsTab, SettingsNav, type SettingsTab } from "@/features/settings/components/settings-nav";
import { UsersTab } from "@/features/settings/users/components/users-tab";
import { listUsers } from "@/features/settings/users/queries";

export const generateMetadata = pageMetadata("settings");

async function UsersSection() {
  const user = await requireUser();
  const [users, stores] = await Promise.all([listUsers(), getVisibleStores(user)]);
  return <UsersTab users={users} stores={stores} currentUserId={user.id} />;
}

function ComingSoon() {
  const t = useTranslations("placeholder");
  return (
    <Card className="rounded-2xl">
      <EmptyState illustration="box" title={t("title")} body={t("body")} />
    </Card>
  );
}

function SettingsLayout({ tab, children }: { tab: SettingsTab; children: React.ReactNode }) {
  const t = useTranslations("pages.settings");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
        <SettingsNav current={tab} />
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}

export default superAdminPage(async function Page({ searchParams }: PageProps<"/[locale]/settings">) {
  const { tab: requested } = await searchParams;
  // Users is the only section built so far (phase 3); the others arrive in phase 5.
  const tab: SettingsTab = isSettingsTab(requested) ? requested : "users";
  return <SettingsLayout tab={tab}>{tab === "users" ? <UsersSection /> : <ComingSoon />}</SettingsLayout>;
});
