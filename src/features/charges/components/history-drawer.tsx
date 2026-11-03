"use client";

import { ArrowRight, CheckCircle2, Loader2, Pencil, PlusCircle, RotateCcw, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-media-query";
import { localized } from "@/lib/localized";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";
import { loadChargeHistory } from "../actions";
import { chargeHistory, type HistoryEvent, type TrackedField } from "../lib";
import type { ChargeReference, ChargeRow } from "../queries";

const ICONS = { created: PlusCircle, approved: CheckCircle2, edited: Pencil, deleted: Trash2, restored: RotateCcw } as const;

type Loaded = { key: string; events: HistoryEvent[] | null; users: Record<string, string>; orders: Record<string, string> };

/** Audit history of one charge: created, approved, edited (field: old → new), deleted, restored. */
export function HistoryDrawer({ charge, reference, onClose }: { charge: ChargeRow | null; reference: ChargeReference; onClose: () => void }) {
  const t = useTranslations("charges.history");
  const tc = useTranslations("common");
  const locale = useLocale();
  const f = useFormat();
  const isMobile = useIsMobile();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = charge ? `${charge.id}:${charge.amount}:${charge.isDeleted}:${charge.reason}` : null;

  useEffect(() => {
    if (!charge || !key) return;
    let live = true;
    void loadChargeHistory({ id: charge.id }).then((r) => {
      if (!live) return;
      setLoaded(r.ok ? { key, events: chargeHistory(r.data.entries).reverse(), users: r.data.users, orders: r.data.orders } : { key, events: null, users: {}, orders: {} });
    });
    return () => {
      live = false;
    };
  }, [charge, key]);

  const history = loaded?.key === key ? loaded : null;

  const value = (field: TrackedField, v: unknown): ReactNode => {
    if (v === null || v === undefined || v === "") return "—";
    if (field === "amount") return f.money(Number(v));
    if (field === "charge_date") return f.date(String(v));
    if (field === "category_id" || field === "location_id") {
      const row = reference.labels[String(v)];
      return row ? localized(row, locale) : "—";
    }
    if (field === "order_id") return history?.orders[String(v)] ?? "—";
    return String(v);
  };

  return (
    <Sheet open={!!charge} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side={isMobile ? "bottom" : "right"} closeLabel={tc("close")} className={cn("gap-0 p-0", isMobile ? "h-[90dvh] rounded-t-3xl" : "w-full sm:max-w-md")}>
        <SheetHeader className="border-b p-5 pr-12">
          <SheetTitle className="text-lg font-semibold">{t("title")}</SheetTitle>
          <SheetDescription>{charge?.reason}</SheetDescription>
          {charge && <p className="num mt-2 text-2xl font-bold">{f.money(charge.amount)}</p>}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto" aria-busy={!history}>
          {!history ? (
            <div className="grid place-items-center p-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-label={tc("loading")} />
            </div>
          ) : !history.events ? (
            <p className="p-5 text-sm text-destructive">{t("loadFailed")}</p>
          ) : history.events.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ol className="divide-y">
              {history.events.map((e, i) => {
                const Icon = ICONS[e.kind];
                return (
                  <li key={`${e.at}-${e.kind}-${i}`} className="flex gap-3 px-5 py-3">
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-lg",
                        e.kind === "deleted" ? "bg-destructive/10 text-destructive" : e.kind === "approved" ? "bg-success/10 text-success-text" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{t(e.kind)}</span>
                      <span className="num block text-xs text-muted-foreground">
                        {f.dateTime(e.at)} · {(e.actor && history.users[e.actor]) || t("system")}
                      </span>
                      {e.kind === "edited" && (
                        <ul className="mt-1.5 space-y-1">
                          {e.changes.map((c) => (
                            <li key={c.field} className="flex flex-wrap items-center gap-1.5 text-sm">
                              <span className="text-muted-foreground">{t(`fields.${c.field}`)}</span>
                              <span className="num line-through decoration-muted-foreground/60">{value(c.field, c.from)}</span>
                              <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
                              <span className="num font-medium">{value(c.field, c.to)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
