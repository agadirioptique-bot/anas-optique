import { pageMetadata } from "@/components/shared/placeholder-page";
import { requireUser, superAdminPage } from "@/features/auth/guards";
import { getVisibleStores } from "@/features/auth/session";
import { getBusinessToday } from "@/features/charges/queries";
import { DashboardPage } from "@/features/dashboard/components/dashboard-page";
import { getDashboard } from "@/features/dashboard/queries";
import { dashboardSearchSchema } from "@/features/dashboard/schemas";
import { getActiveStore } from "@/features/shell/store-scope";

export const generateMetadata = pageMetadata("dashboard");

export default superAdminPage(async function Page({ searchParams }: PageProps<"/[locale]/dashboard">) {
  const user = await requireUser();
  const filters = dashboardSearchSchema.parse(await searchParams);
  // Stores first, then the lab.
  const stores = (await getVisibleStores(user)).toSorted((a, b) => Number(a.kind === "lab") - Number(b.kind === "lab"));
  // No ?store= → the top-bar store (SPEC §11); "all" → every store, Général charges included.
  const fallback = await getActiveStore(user, stores);
  const chosen = filters.store ?? fallback;
  const storeId = chosen !== "all" && stores.some((s) => s.id === chosen) ? chosen : null;
  const data = await getDashboard(filters, await getBusinessToday(), storeId, stores);
  return <DashboardPage data={data} filters={filters} stores={stores} storeName={stores.find((s) => s.id === storeId)?.name ?? null} />;
});
