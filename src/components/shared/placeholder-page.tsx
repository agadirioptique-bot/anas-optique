import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import type { AppLocale } from "@/i18n/routing";
import type messages from "../../../messages/fr.json";
import { EmptyState, PageHeader } from "./page";

export type PageKey = keyof (typeof messages)["pages"];

/** `generateMetadata` for a page: "{title} · OPTICOR". */
export function pageMetadata(page: PageKey) {
  return async ({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> => {
    const { locale } = await params;
    const t = await getTranslations({ locale: locale as AppLocale, namespace: "pages" });
    return { title: t(`${page}.title`) };
  };
}

/** Empty page used until the feature's phase is built. */
export function PlaceholderPage({ page, backHref }: { page: PageKey; backHref?: string }) {
  const t = useTranslations();
  return (
    <>
      <PageHeader title={t(`pages.${page}.title`)} description={t(`pages.${page}.description`)} backHref={backHref} />
      <Card className="rounded-2xl">
        <EmptyState illustration="box" title={t("placeholder.title")} body={t("placeholder.body")} />
      </Card>
    </>
  );
}
