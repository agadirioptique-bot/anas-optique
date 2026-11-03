import { pageMetadata } from "@/components/shared/placeholder-page";
import { requireUser, userPage } from "@/features/auth/guards";
import { getVisibleStores } from "@/features/auth/session";
import { NewOrderWizard } from "@/features/orders/new/components/new-order-wizard";
import { getNewOrderData } from "@/features/orders/new/data";
import { getActiveStore } from "@/features/shell/store-scope";

export const generateMetadata = pageMetadata("newOrder");

export default userPage(async function Page({ searchParams }: PageProps<"/[locale]/orders/new">) {
  const user = await requireUser();
  const { client } = await searchParams;
  const activeStore = await getActiveStore(user, await getVisibleStores(user));
  const clientId = typeof client === "string" && /^[0-9a-f-]{36}$/i.test(client) ? client : null;
  const data = await getNewOrderData(user, activeStore, clientId);
  return <NewOrderWizard data={data} />;
});
