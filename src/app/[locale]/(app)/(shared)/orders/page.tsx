import { pageMetadata } from "@/components/shared/placeholder-page";
import { requireUser, userPage } from "@/features/auth/guards";
import { getVisibleStores } from "@/features/auth/session";
import { OrdersPage } from "@/features/orders/components/orders-page";
import { getBoardOrders, getOrderList, getOrderReference } from "@/features/orders/queries";
import { orderListFiltersSchema } from "@/features/orders/schemas";
import { getActiveStore } from "@/features/shell/store-scope";

export const generateMetadata = pageMetadata("orders");

export default userPage(async function Page({ searchParams }: PageProps<"/[locale]/orders">) {
  const user = await requireUser();
  const filters = orderListFiltersSchema.parse(await searchParams);
  const stores = await getVisibleStores(user);
  const active = await getActiveStore(user, stores);
  // Super admin: top-bar selection ("all" = every store). Secretary: RLS keeps her store only.
  const storeId = user.role === "super_admin" && active !== "all" ? active : null;
  const [{ rows, total }, reference] = await Promise.all([
    filters.view === "list" ? getOrderList(storeId, filters) : getBoardOrders(storeId).then((board) => ({ rows: board, total: board.length })),
    getOrderReference(),
  ]);
  const scope = user.role === "super_admin" ? stores.find((s) => s.id === storeId) : stores.find((s) => s.id === user.storeId);
  return (
    <OrdersPage
      rows={rows}
      total={total}
      filters={filters}
      isSuperAdmin={user.role === "super_admin"}
      showStore={user.role === "super_admin" && !storeId}
      scopeName={scope?.name ?? null}
      stuckDays={reference.stuckDays}
      methods={reference.paymentMethods}
      reasons={reference.cancelReasons}
    />
  );
});
