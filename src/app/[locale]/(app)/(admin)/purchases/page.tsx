import { pageMetadata } from "@/components/shared/placeholder-page";
import { superAdminPage } from "@/features/auth/guards";
import { PurchasesPage } from "@/features/purchases/components/purchases-page";
import { getPurchaseReference, getPurchases, getPurchasingSummary, getSuppliers } from "@/features/purchases/queries";
import { purchasesSearchSchema } from "@/features/purchases/schemas";

export const generateMetadata = pageMetadata("purchases");

export default superAdminPage(async function Page({ searchParams }: PageProps<"/[locale]/purchases">) {
  const { tab } = purchasesSearchSchema.parse(await searchParams);
  const [purchases, suppliers, summary, reference] = await Promise.all([getPurchases(), getSuppliers(), getPurchasingSummary(), getPurchaseReference()]);
  return <PurchasesPage tab={tab} purchases={purchases} suppliers={suppliers} summary={summary} reference={reference} />;
});
