import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import type { AppLocale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/set-password">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as AppLocale, namespace: "auth" });
  return { title: t("setPasswordTitle") };
}

export default function Page() {
  const t = useTranslations("auth");
  return (
    <AuthCard title={t("setPasswordTitle")} subtitle={t("setPasswordSubtitle")}>
      <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{t("comingSoon")}</p>
    </AuthCard>
  );
}
