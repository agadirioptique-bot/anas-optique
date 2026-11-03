import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { EmptyState } from "@/components/shared/page";
import { pageMetadata } from "@/components/shared/placeholder-page";
import { Button } from "@/components/ui/button";
import { superAdminPage } from "@/features/auth/guards";
import { PurchaseDetail } from "@/features/purchases/components/purchase-detail";
import { getPurchase, getPurchaseReference } from "@/features/purchases/queries";
import { Link } from "@/i18n/navigation";

export const generateMetadata = pageMetadata("purchases");

export default superAdminPage(async function Page({ params }: PageProps<"/[locale]/purchases/[id]">) {
  const { id } = await params;
  const [data, reference] = await Promise.all([z.uuid().safeParse(id).success ? getPurchase(id) : null, getPurchaseReference()]);
  if (!data) {
    const t = await getTranslations();
    return (
      <EmptyState
        illustration="search"
        title={t("common.noResults")}
        body={t("purchases.detail.notFound")}
        action={
          <Button asChild variant="outline">
            <Link href="/purchases">{t("purchases.detail.back")}</Link>
          </Button>
        }
      />
    );
  }
  return <PurchaseDetail {...data} methods={reference.methods} />;
});
