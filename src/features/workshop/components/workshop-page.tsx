"use client";

import { AlertTriangle, ArrowRight, Clock, Glasses, Loader2, Timer } from "lucide-react";
import { useLocale, useNow, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { STATUS_DOT, StatusBadge } from "@/components/shared/badges";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { EmptyState, PageHeader, Stat } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Labeled } from "@/features/orders/new/data";
import { nextStatus, OrderActionsProvider, useOrderActions } from "@/features/orders/components/order-actions";
import { prescriptionLine } from "@/features/orders/lib/prescription";
import { Link } from "@/i18n/navigation";
import { localized } from "@/lib/localized";
import { cn } from "@/lib/utils";
import { daysSince, isLate, progress, QUEUE, workshopSummary, type StuckDays } from "../lib";
import type { WorkshopOrder } from "../queries";

type Filter = "all" | "late" | (typeof QUEUE)[number];

const BAR = { ok: "bg-success", soon: "bg-attention", late: "bg-destructive" } as const;
const TEXT = { ok: "text-success-text", soon: "text-attention-text", late: "text-destructive" } as const;

/** Workshop queue (SPEC §8, super admin): oldest first, one main action per card that moves the status. */
export function WorkshopPage({
  orders,
  stuckDays,
  storeName,
  methods,
  reasons,
}: {
  orders: WorkshopOrder[];
  stuckDays: StuckDays;
  /** Top-bar store, or null for every store (cards then show their store). */
  storeName: string | null;
  methods: Labeled[];
  reasons: Labeled[];
}) {
  return (
    <OrderActionsProvider isSuperAdmin methods={methods} reasons={reasons}>
      <Workshop orders={orders} stuckDays={stuckDays} storeName={storeName} />
    </OrderActionsProvider>
  );
}

function Workshop({ orders, stuckDays, storeName }: { orders: WorkshopOrder[]; stuckDays: StuckDays; storeName: string | null }) {
  const t = useTranslations();
  const now = useNow({ updateInterval: 60_000 });
  const [filter, setFilter] = useState<Filter>("all");
  const summary = workshopSummary(orders, stuckDays, now);

  const shown = useMemo(
    () => orders.filter((o) => (filter === "all" ? true : filter === "late" ? isLate(o, stuckDays, now) : o.status === filter)),
    [orders, filter, stuckDays, now],
  );

  return (
    <>
      <PageHeader title={t("pages.workshop.title")} description={storeName ? t("workshop.descriptionScoped", { store: storeName }) : t("pages.workshop.description")} />

      <Card className="mb-5">
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label={t("workshop.summary.queue")} value={t("workshop.summary.queueValue", { count: summary.total })} />
          <Stat label={t("workshop.summary.age")} value={t("common.days", { count: summary.averageAge })} />
          <Stat
            label={t("workshop.summary.late")}
            value={<span className={summary.late ? "text-destructive" : undefined}>{t("workshop.summary.lateValue", { count: summary.late })}</span>}
          />
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{t("workshop.summary.byStep")}</p>
            <div className="flex items-center gap-3 pt-1">
              {QUEUE.map((s) => (
                <span key={s} className="flex items-center gap-1.5 text-sm" title={t(`status.${s}`)}>
                  <span className={cn("size-2.5 rounded-full", STATUS_DOT[s])} aria-hidden="true" />
                  <span className="num font-semibold">{summary.byStatus[s]}</span>
                  <span className="sr-only">{t(`status.${s}`)}</span>
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <ChoiceChips
        label={t("workshop.chips.label")}
        className="mb-5"
        value={filter}
        onChange={(v) => setFilter((v || "all") as Filter)}
        options={[
          { value: "all", label: `${t("workshop.chips.all")} · ${summary.total}` },
          ...QUEUE.map((s) => ({ value: s, label: `${t(`status.${s}`)} · ${summary.byStatus[s]}` })),
          { value: "late", label: `${t("workshop.chips.late")} · ${summary.late}` },
        ]}
      />

      {shown.length === 0 ? (
        <EmptyState illustration="box" title={orders.length ? t("workshop.emptyFilter") : t("workshop.empty")} body={orders.length ? undefined : t("workshop.emptyBody")} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((o) => (
            <li key={o.id}>
              <WorkshopCard order={o} stuckDays={stuckDays} now={now} showStore={!storeName} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function WorkshopCard({ order: o, stuckDays, now, showStore }: { order: WorkshopOrder; stuckDays: StuckDays; now: Date; showStore: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  const actions = useOrderActions();
  const [moving, setMoving] = useState(false);
  const next = nextStatus(o.status);
  const late = isLate(o, stuckDays, now);
  const bar = progress(o, stuckDays, now);
  const inStatus = daysSince(o.statusSince, now);
  const age = daysSince(o.createdAt, now);
  const measures = [
    o.epRe !== null && o.epLe !== null ? t("workshop.ep", { re: o.epRe, le: o.epLe }) : null,
    o.fittingHeight !== null ? t("workshop.height", { value: o.fittingHeight }) : null,
  ].filter(Boolean);

  return (
    <Card className={cn("h-full gap-3 py-4", late && "border-destructive/60")} data-testid={`workshop-card-${o.displayNumber}`}>
      <CardContent className="flex h-full flex-col gap-3 px-4">
        <div className="flex items-center gap-2">
          <Link href={`/orders/${o.id}`} className="num text-lg font-bold text-primary hover:underline">
            {o.displayNumber}
          </Link>
          {showStore && <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{o.storeName}</span>}
          <StatusBadge status={o.status} className="ml-auto" />
        </div>
        <p className="truncate font-medium">{o.clientName}</p>

        <div className="space-y-0.5 rounded-xl bg-muted/60 px-3 py-2 text-sm">
          <p className="num">
            <span className="mr-2 font-bold">{t("rx.od")}</span>
            {prescriptionLine(o.rx.od)}
          </p>
          <p className="num">
            <span className="mr-2 font-bold">{t("rx.og")}</span>
            {prescriptionLine(o.rx.og)}
          </p>
          {measures.length > 0 && <p className="num pt-0.5 text-xs text-muted-foreground">{measures.join(" · ")}</p>}
        </div>

        <dl className="space-y-1.5 text-sm">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-muted-foreground">{t("workshop.lens")}</dt>
            <dd className="min-w-0 space-y-1">
              <span className={cn("block font-medium", !o.lensType && "text-muted-foreground")}>{o.lensType ? localized(o.lensType, locale) : t("workshop.noLensType")}</span>
              {o.treatments.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {o.treatments.map((tr) => (
                    <span key={tr.label_fr} className="rounded-md bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground">
                      {localized(tr, locale)}
                    </span>
                  ))}
                </span>
              )}
              {o.lensDetails && <span className="block text-xs whitespace-pre-line text-muted-foreground">{o.lensDetails}</span>}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-muted-foreground">{t("workshop.frame")}</dt>
            <dd className="min-w-0 truncate font-medium">{o.ownFrame ? t("detail.clientFrame") : (o.frameName ?? "—")}</dd>
          </div>
        </dl>

        <div className="mt-auto space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className={cn("flex items-center gap-1 font-medium", TEXT[bar.tone])}>
              {late ? <AlertTriangle className="size-3.5" aria-hidden="true" /> : <Timer className="size-3.5" aria-hidden="true" />}
              {t("orders.daysInStatus", { count: inStatus })}
              {late && <span className="rounded bg-destructive/10 px-1.5 py-0.5 font-semibold">{t("workshop.late")}</span>}
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="size-3.5" aria-hidden="true" />
              {t("workshop.age", { count: age })}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className={cn("h-full rounded-full transition-all", BAR[bar.tone])} style={{ width: `${Math.round(bar.ratio * 100)}%` }} />
          </div>
        </div>

        {next && (
          <Button
            size="lg"
            className="h-12 w-full justify-between text-base"
            disabled={moving}
            onClick={async () => {
              setMoving(true);
              await actions.advance(o);
              setMoving(false);
            }}
          >
            <span className="flex items-center gap-2">
              {moving ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Glasses className="size-5" aria-hidden="true" />}
              {t(`statusNext.${next}`)}
            </span>
            <ArrowRight />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
