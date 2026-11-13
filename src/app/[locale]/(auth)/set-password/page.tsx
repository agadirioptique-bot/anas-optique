import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { SetPasswordForm } from "@/features/auth/components/set-password-form";
import { getPasswordSetupUser } from "@/features/auth/session";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/set-password">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as AppLocale, namespace: "auth" });
  return { title: t("setPasswordTitle") };
}

/**
 * Reached from an invite or reset link (/auth/confirm opened the session). Any other session — e.g. a
 * signed-in computer left unattended — gets "ask for a new link" instead of the form.
 */
export default async function Page() {
  const t = await getTranslations("auth");
  const user = await getPasswordSetupUser();
  return (
    <AuthCard title={t("setPasswordTitle")} subtitle={user ? t("setPasswordSubtitle") : t("setPasswordNoSession")}>
      {user ? (
        <SetPasswordForm email={user.email} />
      ) : (
        <Button asChild size="lg" className="w-full">
          <Link href="/forgot-password">{t("setPasswordNoSessionCta")}</Link>
        </Button>
      )}
    </AuthCard>
  );
}
