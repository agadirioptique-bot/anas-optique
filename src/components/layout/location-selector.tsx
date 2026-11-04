"use client";

import { Building2, FlaskConical, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setActiveStore } from "@/features/shell/actions";
import { cn } from "@/lib/utils";
import { useShell } from "./shell-context";

/** Super admin: "All stores" or one store/lab. Secretary: her store as a static pill. */
export function LocationSelector({ className }: { className?: string }) {
  const t = useTranslations();
  const { user, stores, activeStore } = useShell();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [value, setOptimistic] = useOptimistic(activeStore);
  const labelId = useId();
  const triggerId = useId();

  if (user.role !== "super_admin") {
    const own = stores.find((s) => s.id === user.storeId);
    if (!own) return null;
    return (
      <span className={cn("inline-flex h-9 items-center gap-2 rounded-full bg-accent px-3 text-sm font-medium text-accent-foreground", className)}>
        <MapPin className="size-4" aria-hidden="true" />
        <span className="truncate">{own.name}</span>
      </span>
    );
  }

  const onChange = (next: string) =>
    startTransition(async () => {
      setOptimistic(next);
      const res = await setActiveStore(next);
      if (!res.ok) toast.error(t("shell.storeChangeFailed"));
      router.refresh();
    });

  return (
    <Select value={value} onValueChange={onChange}>
      {/* Name = "Succursale affichée" + the visible value (WCAG 2.5.3: the visible text is part of the name). */}
      <span id={labelId} className="sr-only">
        {t("shell.locationSelector")}
      </span>
      <SelectTrigger id={triggerId} className={cn("w-full min-w-0 sm:w-60", className)} aria-labelledby={`${labelId} ${triggerId}`} title={t("shell.locationSelector")}>
        <Building2 className="text-muted-foreground" aria-hidden="true" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t("common.allLocations")}</SelectItem>
        <SelectGroup>
          <SelectLabel>{t("common.locations")}</SelectLabel>
          {stores
            .filter((s) => s.kind === "store")
            .map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>{t("common.lab")}</SelectLabel>
          {stores
            .filter((s) => s.kind === "lab")
            .map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <FlaskConical className="text-muted-foreground" aria-hidden="true" />
                {s.name}
              </SelectItem>
            ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
