import { pageMetadata } from "@/components/shared/placeholder-page";
import { requireUser, superAdminPage } from "@/features/auth/guards";
import { getVisibleStores } from "@/features/auth/session";
import { getOrderReference } from "@/features/orders/queries";
import { getActiveStore } from "@/features/shell/store-scope";
import { WorkshopPage } from "@/features/workshop/components/workshop-page";
import { getWorkshopQueue } from "@/features/workshop/queries";

export const generateMetadata = pageMetadata("workshop");

export default superAdminPage(async function Page() {
  const user = await requireUser();
  const stores = await getVisibleStores(user);
  const active = await getActiveStore(user, stores);
  // Top-bar store selector (SPEC §11): one store, or every store with a store pill on each card.
  const storeId = active === "all" ? null : active;
  const [orders, reference] = await Promise.all([getWorkshopQueue(storeId), getOrderReference()]);
  return (
    <WorkshopPage
      orders={orders}
      stuckDays={reference.stuckDays}
      storeName={stores.find((s) => s.id === storeId)?.name ?? null}
      methods={reference.paymentMethods}
      reasons={reference.cancelReasons}
    />
  );
});
