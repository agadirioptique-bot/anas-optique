"use client";

import { CalendarRange, Loader2, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { StoreSummary } from "@/features/auth/types";
import { COMPARISONS, PRESETS, type Comparison, type Preset, type Range } from "../periods";

/** Range label from business-date strings, formatted in UTC so server and browser agree. */
export function useRangeLabel() {
  const locale = useLocale();
  const t = useTranslations("dashboard.filters");
  const fmt = (date: string, withYear: boolean) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short", ...(withYear && { year: "numeric" }), timeZone: "UTC" }).format(
      new Date(`${date}T12:00:00Z`),
    );
  return (r: Range) => (r.from === r.to ? fmt(r.from, true) : t("range", { from: fmt(r.from, r.from.slice(0, 4) !== r.to.slice(0, 4)), to: fmt(r.to, true) }));
}

/** Period chips (a select on phones) + custom range, store, comparison. State lives in the URL. */
export function DashboardFilters({
  preset,
  range,
  previous,
  storeId,
  stores,
  comparison,
  busy,
  onChange,
}: {
  preset: Preset;
  range: Range;
  previous: Range | null;
  storeId: string | null;
  stores: StoreSummary[];
  comparison: Comparison;
  busy: boolean;
  onChange: (patch: { period?: Preset; from?: string; to?: string; store?: string; compare?: Comparison }) => void;
}) {
  const t = useTranslations("dashboard.filters");
  const label = useRangeLabel();

  return (
    <div className="z-20 -mx-4 mb-6 border-b bg-background/90 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/75 sm:-mx-6 sm:px-6 md:sticky md:top-16 lg:-mx-8 lg:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <div className="hidden flex-wrap gap-1.5 xl:flex" role="group" aria-label={t("period")}>
          {PRESETS.map((p) => (
            <Button key={p} size="sm" variant={preset === p ? "default" : "outline"} className="rounded-full" aria-pressed={preset === p} onClick={() => onChange({ period: p })}>
              {p === "custom" && <CalendarRange />}
              {t(p)}
            </Button>
          ))}
        </div>
        <Select value={preset} onValueChange={(v) => onChange({ period: v as Preset })}>
          <SelectTrigger className="w-full sm:w-44 xl:hidden" aria-label={t("period")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p} value={p}>
                {t(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={storeId ?? "all"} onValueChange={(v) => onChange({ store: v })}>
          <SelectTrigger className="min-w-0 flex-1 sm:w-56 sm:flex-none" aria-label={t("store")}>
            <MapPin className="text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStores")}</SelectItem>
            {stores.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={comparison}
          onValueChange={(v) => v && onChange({ compare: v as Comparison })}
          aria-label={t("compare")}
          className="ml-auto"
        >
          {COMPARISONS.map((c) => (
            <ToggleGroupItem key={c} value={c} className="px-3">
              {t(c)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {preset === "custom" && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="dash-from" className="text-xs">
              {t("from")}
            </Label>
            <Input id="dash-from" type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && onChange({ period: "custom", from: e.target.value, to: range.to })} className="w-44" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dash-to" className="text-xs">
              {t("to")}
            </Label>
            <Input id="dash-to" type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && onChange({ period: "custom", from: range.from, to: e.target.value })} className="w-44" />
          </div>
        </div>
      )}

      <p className="num mt-2 flex items-center gap-2 text-xs text-muted-foreground" data-testid="dashboard-range">
        {label(range)}
        {previous && <span>· {t("vs", { range: label(previous) })}</span>}
        {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
      </p>
    </div>
  );
}
