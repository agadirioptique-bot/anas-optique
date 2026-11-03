import { getSessionUser } from "@/features/auth/session";
import { redirect } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { homePath } from "@/lib/permissions";

/** "/" → the user's home page, or the login page. */
export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  const user = await getSessionUser();
  redirect({ href: homePath(user?.role ?? null), locale: locale as AppLocale });
}
