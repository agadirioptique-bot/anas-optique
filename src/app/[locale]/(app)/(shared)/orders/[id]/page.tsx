import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { EmptyState } from "@/components/shared/page";
import { pageMetadata } from "@/components/shared/placeholder-page";
import { Button } from "@/components/ui/button";
import { requireUser, userPage } from "@/features/auth/guards";
import { OrderDetail } from "@/features/orders/components/order-detail";
import { getOrderDetail } from "@/features/orders/detail";
import { getOrderReference } from "@/features/orders/queries";
import { Link } from "@/i18n/navigation";

export const generateMetadata = pageMetadata("orderDetail");

export default userPage(async function Page({ params }: PageProps<"/[locale]/orders/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const [data, reference] = await Promise.all([z.uuid().safeParse(id).success ? getOrderDetail(id) : null, getOrderReference()]);
  if (!data) {
    const t = await getTranslations();
    return (
      <EmptyState
        illustration="search"
        title={t("common.noResults")}
        body={t("detail.notFound")}
        action={
          <Button asChild variant="outline">
            <Link href="/orders">{t("detail.backToOrders")}</Link>
          </Button>
        }
      />
    );
  }
  return <OrderDetail data={data} isSuperAdmin={user.role === "super_admin"} methods={reference.paymentMethods} reasons={reference.cancelReasons} />;
});
