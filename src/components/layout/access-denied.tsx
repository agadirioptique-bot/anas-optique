import { ShieldX } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { homePath, type AppRole } from "@/lib/permissions";

/** Shown in place of a page the user's role cannot open. */
export function AccessDenied({ role }: { role: AppRole }) {
  const t = useTranslations("unauthorized");
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center" data-testid="access-denied">
      <span className="grid size-16 place-items-center rounded-2xl bg-destructive/10 text-destructive">
        <ShieldX className="size-8" aria-hidden="true" />
      </span>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("body")}</p>
      <Button asChild size="lg">
        <Link href={homePath(role)}>{t("cta")}</Link>
      </Button>
    </div>
  );
}
