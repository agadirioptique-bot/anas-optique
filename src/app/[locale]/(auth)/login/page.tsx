import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/features/auth/components/login-form";
import { getSessionUser } from "@/features/auth/session";
import { redirect } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { ERROR_CODES, type ErrorCode } from "@/lib/errors";
import { homePath } from "@/lib/permissions";

export async function generateMetadata({ params }: PageProps<"/[locale]/login">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as AppLocale, namespace: "auth" });
  return { title: t("loginTitle") };
}

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  const user = await getSessionUser();
  if (user) redirect({ href: homePath(user.role), locale: locale as AppLocale });
  const t = await getTranslations("auth");
  const { error } = await searchParams;
  // e.g. ?error=linkInvalid from /auth/confirm
  const initialError = (ERROR_CODES as readonly string[]).includes(String(error)) ? (error as ErrorCode) : undefined;
  return (
    <AuthCard title={t("loginTitle")} subtitle={t("loginSubtitle")}>
      <LoginForm initialError={initialError} />
    </AuthCard>
  );
}
