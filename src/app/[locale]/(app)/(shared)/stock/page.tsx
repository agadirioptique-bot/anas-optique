import { pageMetadata } from "@/components/shared/placeholder-page";
import { requireUser, userPage } from "@/features/auth/guards";
import { getVisibleStores } from "@/features/auth/session";
import { getActiveStore } from "@/features/shell/store-scope";
import { StockPage } from "@/features/stock/components/stock-page";
import { getAdjustmentReasons, getStockOverview } from "@/features/stock/queries";
import { stockSearchSchema } from "@/features/stock/schemas";

export const generateMetadata = pageMetadata("stock");

export default userPage(async function Page({ searchParams }: PageProps<"/[locale]/stock">) {
  const user = await requireUser();
  const isSuperAdmin = user.role === "super_admin";
  const { location } = stockSearchSchema.parse(await searchParams);
  // Stores first, then the lab (one tab each).
  const stores = (await getVisibleStores(user)).toSorted((a, b) => Number(a.kind === "lab") - Number(b.kind === "lab"));
  const active = await getActiveStore(user, stores);
  const initial =
    (isSuperAdmin && stores.find((s) => s.id === location)?.id) || stores.find((s) => s.id === active)?.id || stores[0]?.id || "";
  // Super admin: every location at once (tabs switch instantly, the transfer dialog needs source levels).
  // Secretary: RLS + the view keep her store only.
  const [rows, reasons] = await Promise.all([getStockOverview(isSuperAdmin ? null : initial), isSuperAdmin ? getAdjustmentReasons() : []]);
  return <StockPage isSuperAdmin={isSuperAdmin} locations={stores} initialLocationId={initial} rows={rows} reasons={reasons} />;
});
