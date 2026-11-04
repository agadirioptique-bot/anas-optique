"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Body of the `error.tsx` boundaries. In production a Server Component error only carries a
 * digest (no message), which is shown as a reference to match the server logs.
 */
export function ErrorState({ error, retry, className }: { error: unknown; retry: () => void; className?: string }) {
  const t = useTranslations("errorPage");
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className={cn("mx-auto flex max-w-md flex-col items-center justify-center gap-4 px-6 py-16 text-center", className)}>
      <span className="grid size-16 place-items-center rounded-2xl bg-destructive/10 text-destructive">
        <TriangleAlert className="size-8" aria-hidden="true" />
      </span>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("body")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button size="lg" onClick={() => retry()}>
          <RotateCcw />
          {t("retry")}
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/">{t("home")}</Link>
        </Button>
      </div>
      {digest && <p className="num text-xs text-muted-foreground">{t("reference", { digest })}</p>}
    </div>
  );
}

/** Page-shaped placeholder while a signed-in page streams in (header, KPI strip, rows). */
export function PageSkeleton({ variant = "list" }: { variant?: "list" | "board" | "dashboard" }) {
  const t = useTranslations("common");
  return (
    <div role="status" aria-live="polite" className="animate-in fade-in duration-300">
      <span className="sr-only">{t("loading")}</span>
      <div className="mb-6 space-y-2" aria-hidden="true">
        <Skeleton className="h-8 w-56 rounded-lg" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="mb-5 flex gap-2 overflow-hidden" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      {variant === "board" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 4 }, (_, col) => (
            <div key={col} className="space-y-3 rounded-2xl bg-muted/40 p-3">
              <Skeleton className="h-5 w-28" />
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5" aria-hidden="true">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className={cn("rounded-2xl", variant === "dashboard" ? "h-36" : "h-24")} />
            ))}
          </div>
          {variant === "dashboard" ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
              <Skeleton className="h-80 rounded-2xl" />
            </div>
          ) : (
            <div className="space-y-2 rounded-2xl border p-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-11 rounded-lg" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
