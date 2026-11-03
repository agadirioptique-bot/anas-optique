"use client";

import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

export function useSwitchLocale() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  return (locale: AppLocale) => {
    const qs = search.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { locale, scroll: false });
  };
}
