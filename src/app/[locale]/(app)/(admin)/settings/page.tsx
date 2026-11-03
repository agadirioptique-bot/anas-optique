import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/shared/page";
import { pageMetadata } from "@/components/shared/placeholder-page";
import { requireUser, superAdminPage } from "@/features/auth/guards";
import { getVisibleStores } from "@/features/auth/session";
import { isSettingsTab, SettingsNav, type SettingsTab } from "@/features/settings/components/settings-nav";
import { ChargeLocationsTab } from "@/features/settings/charge-locations/components/charge-locations-tab";
import { getChargeLocations } from "@/features/settings/charge-locations/queries";
import { FieldsTab } from "@/features/settings/fields/components/fields-tab";
import { getFieldsData } from "@/features/settings/fields/queries";
import { ListsTab } from "@/features/settings/lists/components/lists-tab";
import { getListItems } from "@/features/settings/lists/queries";
import { ProductsTab } from "@/features/settings/products/components/products-tab";
import { getProductsData } from "@/features/settings/products/queries";
import { RolesTab } from "@/features/settings/roles/components/roles-tab";
import { getRolePermissions } from "@/features/settings/roles/queries";
import { StoresTab } from "@/features/settings/stores/components/stores-tab";
import { getStores } from "@/features/settings/stores/queries";
import { LoyaltyTab } from "@/features/settings/thresholds/components/loyalty-tab";
import { StuckDaysTab } from "@/features/settings/thresholds/components/stuck-days-tab";
import { getLoyaltyData, getStuckDays } from "@/features/settings/thresholds/queries";
import { UsersTab } from "@/features/settings/users/components/users-tab";
import { listUsers } from "@/features/settings/users/queries";

export const generateMetadata = pageMetadata("settings");

async function UsersSection() {
  const user = await requireUser();
  const [users, stores] = await Promise.all([listUsers(), getVisibleStores(user)]);
  return <UsersTab users={users} stores={stores} currentUserId={user.id} />;
}

async function ListsSection() {
  return <ListsTab items={await getListItems()} />;
}

async function ProductsSection() {
  return <ProductsTab data={await getProductsData()} />;
}

async function FieldsSection() {
  return <FieldsTab data={await getFieldsData()} />;
}

async function StoresSection() {
  return <StoresTab stores={await getStores()} />;
}

async function ChargeLocationsSection() {
  return <ChargeLocationsTab locations={await getChargeLocations()} />;
}

async function LoyaltySection() {
  return <LoyaltyTab data={await getLoyaltyData()} />;
}

async function NotificationsSection() {
  return <StuckDaysTab days={await getStuckDays()} />;
}

async function RolesSection() {
  return <RolesTab permissions={await getRolePermissions()} />;
}

/** One server component per sub-page: each loads only its own data. */
const SECTIONS: Record<SettingsTab, () => Promise<ReactNode>> = {
  lists: ListsSection,
  products: ProductsSection,
  fields: FieldsSection,
  stores: StoresSection,
  users: UsersSection,
  chargeLocations: ChargeLocationsSection,
  loyalty: LoyaltySection,
  notifications: NotificationsSection,
  roles: RolesSection,
};

function SettingsLayout({ tab, children }: { tab: SettingsTab; children: ReactNode }) {
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
  const tab: SettingsTab = isSettingsTab(requested) ? requested : "lists";
  const Section = SECTIONS[tab];
  return (
    <SettingsLayout tab={tab}>
      <Section />
    </SettingsLayout>
  );
});
