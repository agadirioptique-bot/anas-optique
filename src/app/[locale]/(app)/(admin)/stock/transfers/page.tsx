import { pageMetadata } from "@/components/shared/placeholder-page";
import { requireUser, superAdminPage } from "@/features/auth/guards";
import { getVisibleStores } from "@/features/auth/session";
import { TransfersPage } from "@/features/stock/components/transfers-page";
import { getStockOverview, getTransfers } from "@/features/stock/queries";

export const generateMetadata = pageMetadata("transfers");

export default superAdminPage(async function Page() {
  const user = await requireUser();
  const [stores, { transfers, users }, levels] = await Promise.all([getVisibleStores(user), getTransfers(), getStockOverview(null)]);
  const locations = stores.toSorted((a, b) => Number(a.kind === "lab") - Number(b.kind === "lab"));
  return <TransfersPage transfers={transfers} users={users} locations={locations} levels={levels} />;
});
