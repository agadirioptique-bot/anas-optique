import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { getSessionUser } from "@/features/auth/session";
import { redirect } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { homePath } from "@/lib/permissions";

export async function generateMetadata({ params }: PageProps<"/[locale]/forgot-password">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as AppLocale, namespace: "auth" });
  return { title: t("forgotTitle") };
}

export default async function Page({ params }: PageProps<"/[locale]/forgot-password">) {
  const { locale } = await params;
  const user = await getSessionUser();
  if (user) redirect({ href: homePath(user.role), locale: locale as AppLocale });
  const t = await getTranslations("auth");
  return (
    <AuthCard title={t("forgotTitle")} subtitle={t("forgotSubtitle")}>
      <ForgotPasswordForm />
    </AuthCard>
  );
}
