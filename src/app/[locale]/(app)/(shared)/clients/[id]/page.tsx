import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { EmptyState } from "@/components/shared/page";
import { pageMetadata } from "@/components/shared/placeholder-page";
import { Button } from "@/components/ui/button";
import { requireUser, userPage } from "@/features/auth/guards";
import { ClientDetail } from "@/features/clients/components/client-detail";
import { getClientFile } from "@/features/clients/queries";
import { Link } from "@/i18n/navigation";

export const generateMetadata = pageMetadata("clientDetail");

export default userPage(async function Page({ params }: PageProps<"/[locale]/clients/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const file = z.uuid().safeParse(id).success ? await getClientFile(id) : null;
  if (!file) {
    const t = await getTranslations();
    return (
      <EmptyState
        title={t("common.noResults")}
        body={t("clients.notFound")}
        action={
          <Button asChild variant="outline">
            <Link href="/clients">{t("clients.backToClients")}</Link>
          </Button>
        }
      />
    );
  }
  return <ClientDetail file={file} isSuperAdmin={user.role === "super_admin"} ownStoreId={user.storeId} />;
});
