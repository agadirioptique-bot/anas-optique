"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSwitchLocale } from "@/components/layout/use-switch-locale";
import type { AppLocale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function LanguageToggle() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const switchLocale = useSwitchLocale();
  return (
    <div className="inline-flex rounded-full border bg-card p-1 text-sm" role="group" aria-label={t("languageToggle")}>
      {(["fr", "en"] as AppLocale[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchLocale(l)}
          aria-pressed={locale === l}
          className={cn(
            "h-8 rounded-full px-3 font-medium text-muted-foreground uppercase transition-colors pointer-coarse:h-10",
            locale === l && "bg-primary text-primary-foreground",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
