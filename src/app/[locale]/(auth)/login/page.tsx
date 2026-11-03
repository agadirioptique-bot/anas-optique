import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { DevSignIn } from "@/features/dev/dev-sign-in";
import { isDevFakeAuth } from "@/features/dev/flags";
import type { AppLocale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/login">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as AppLocale, namespace: "auth" });
  return { title: t("loginTitle") };
}

export default function LoginPage() {
  const t = useTranslations("auth");
  return (
    <AuthCard title={t("loginTitle")} subtitle={t("loginSubtitle")}>
      <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{t("comingSoon")}</p>
      {isDevFakeAuth() && (
        <div className="mt-6">
          <DevSignIn />
        </div>
      )}
    </AuthCard>
  );
}
