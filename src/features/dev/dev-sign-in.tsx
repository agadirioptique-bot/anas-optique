"use client";

import { ArrowRight, Crown, Headset } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { homePath, ROLES } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { setDevRole } from "./actions";

/** Phase 1 only (removed in phase 3): enter the app with a fake role. */
export function DevSignIn() {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium tracking-wide text-attention-text uppercase">{t("dev.loginHint")}</p>
      {ROLES.map((role) => (
        <button
          key={role}
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setDevRole(role);
              router.push(homePath(role));
              router.refresh();
            })
          }
          className="group flex w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lift focus-visible:border-primary disabled:opacity-60"
        >
          <span
            className={cn(
              "grid size-12 shrink-0 place-items-center rounded-xl",
              role === "super_admin" ? "bg-primary text-primary-foreground" : "bg-attention/12 text-attention-text",
            )}
          >
            {role === "super_admin" ? <Crown className="size-5" /> : <Headset className="size-5" />}
          </span>
          <span className="min-w-0 flex-1 font-semibold">{t("dev.enterAs", { role: t(`roles.${role}`) })}</span>
          <ArrowRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
