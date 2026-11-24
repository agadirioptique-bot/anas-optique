"use client";

import { AlertTriangle, ArrowRight, Banknote, CalendarClock, Glasses, HandCoins, ReceiptText, ShoppingBag, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { useTransition, type ReactNode } from "react";
import { Money, ResteBadge, WhatsAppIcon } from "@/components/shared/badges";
import { PageHeader, Stat } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { StoreSummary } from "@/features/auth/types";
import { useReadyWhatsAppHref } from "@/features/orders/use-whatsapp";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { localized } from "@/lib/localized";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";
import { percentDelta, type Comparison, type Preset } from "../periods";
import type { DashboardData, KpiPoint, KpiSummary } from "../queries";
import type { DashboardFilters as Filters } from "../schemas";
import { DashboardFilters } from "./filter-bar";
import { KpiCard } from "./kpis";

// Recharts is only downloaded and parsed in the browser.
const chartLoading = () => <Skeleton className="h-80 w-full rounded-2xl" />;
const RevenueChart = dynamic(() => import("./charts").then((m) => m.RevenueChart), { ssr: false, loading: chartLoading });
const StoresChart = dynamic(() => import("./charts").then((m) => m.StoresChart), { ssr: false, loading: chartLoading });
const SegmentsChart = dynamic(() => import("./charts").then((m) => m.SegmentsChart), { ssr: false, loading: chartLoading });
const SalesMix = dynamic(() => import("./charts").then((m) => m.SalesMix), { ssr: false, loading: chartLoading });
const HeatmapChart = dynamic(() => import("./charts").then((m) => m.HeatmapChart), { ssr: false, loading: chartLoading });
const LeadTimesChart = dynamic(() => import("./charts").then((m) => m.LeadTimesChart), { ssr: false, loading: chartLoading });
// Plain HTML, but its dates are only formatted in the browser (SPEC §11).
const ActivityCalendar = dynamic(() => import("./activity-calendar").then((m) => m.ActivityCalendar), { ssr: false, loading: chartLoading });

type CardKey = "revenue" | "collected" | "charges" | "net" | "orders" | "avgBasket" | "balance";

const CARDS: Record<CardKey, { icon: LucideIcon; value: (k: KpiSummary) => number | null; point: (p: KpiPoint) => number | null; money: boolean; invert?: boolean }> = {
  revenue: { icon: TrendingUp, value: (k) => k.revenue, point: (p) => p.revenue, money: true },
  collected: { icon: HandCoins, value: (k) => k.collected, point: (p) => p.collected, money: true },
  charges: { icon: ReceiptText, value: (k) => k.charges, point: (p) => p.charges, money: true, invert: true },
  net: { icon: Wallet, value: (k) => k.net, point: (p) => p.net, money: true },
  orders: { icon: ShoppingBag, value: (k) => k.orders, point: (p) => p.orders, money: false },
  avgBasket: { icon: ShoppingBag, value: (k) => k.avg_basket, point: (p) => p.avg_basket, money: true },
  balance: { icon: Banknote, value: (k) => k.balance_to_collect, point: (p) => p.balance_to_collect, money: true, invert: true },
};

/** Dashboard (SPEC §8–9, super admin). Every number comes from the kpi_* SQL functions. */
export function DashboardPage({ data, filters, stores, storeName }: { data: DashboardData; filters: Filters; stores: StoreSummary[]; storeName: string | null }) {
  const t = useTranslations("dashboard");
  const tp = useTranslations("pages.dashboard");
  const f = useFormat();
  const router = useRouter();
  const pathname = usePathname();
  const [busy, startTransition] = useTransition();
  const k = data.summary;
  const p = data.previousSummary;
  const period = filters.compare !== "none" ? t(`periods.${filters.compare}`) : undefined;

  const navigate = (patch: { period?: Preset; from?: string; to?: string; store?: string; compare?: Comparison }) => {
    const next = { ...filters, store: data.storeId ?? "all", ...patch };
    const query: Record<string, string> = {};
    if (next.period !== "thisMonth") query.period = next.period;
    if (next.period === "custom") {
      query.from = patch.from ?? data.range.from;
      query.to = patch.to ?? data.range.to;
    }
    query.store = next.store ?? "all";
    if (next.compare !== "m1") query.compare = next.compare;
    startTransition(() => router.replace({ pathname, query }, { scroll: false }));
  };

  const card = (key: CardKey, opts: { hero?: boolean; className?: string; hint?: ReactNode } = {}) => {
    const c = CARDS[key];
    const value = c.value(k);
    return (
      <KpiCard
        key={key}
        testId={`kpi-${key}`}
        hero={opts.hero}
        className={opts.className}
        label={t(`kpis.${key}`)}
        value={value === null ? "—" : c.money ? f.money(value) : f.number(value)}
        hint={opts.hint}
        delta={p ? percentDelta(value, c.value(p)) : undefined}
        invert={c.invert}
        period={period}
        spark={data.series.points.map((pt) => c.point(pt) ?? 0)}
        icon={c.icon}
      />
    );
  };

  // Today: what came in the till matters more than what was sold (SPEC §9).
  const heroKey: "revenue" | "collected" = filters.period === "today" ? "collected" : "revenue";
  const second: "revenue" | "collected" = heroKey === "revenue" ? "collected" : "revenue";
  // CA: say how much of it is money kept on cancelled orders (not refunded).
  const hint = (key: "revenue" | "collected") =>
    key === "revenue" && k.kept_on_cancelled > 0 ? t("kpis.revenueHintKept", { amount: f.money(k.kept_on_cancelled) }) : t(`kpis.${key}Hint`);

  return (
    <>
      <PageHeader title={tp("title")} description={storeName ? t("descriptionScoped", { store: storeName }) : tp("description")} />
      <DashboardFilters
        preset={filters.period}
        range={data.range}
        previous={data.previous}
        storeId={data.storeId}
        stores={stores}
        comparison={filters.compare}
        busy={busy}
        onChange={navigate}
      />

      <div className={cn("space-y-6 transition-opacity", busy && "opacity-60")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {card(heroKey, { hero: true, className: "sm:col-span-2", hint: hint(heroKey) })}
          {card(second, { hint: hint(second) })}
          {card("charges", { hint: t("kpis.chargesHint") })}
          {card("net", { hint: t("kpis.netHint") })}
          {card("orders")}
          {card("avgBasket")}
          {card("balance", { hint: t("kpis.balanceHint") })}
        </div>

        <MoreKpis k={k} />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RevenueChart series={data.series} previousSeries={data.previousSeries} summary={k} previousSummary={p} period={period ?? ""} />
          </div>
          <SegmentsChart breakdown={data.breakdown} served={k.served_clients} />
          <div className="lg:col-span-2">
            <StoresChart breakdown={data.breakdown} />
          </div>
          <SalesMix breakdown={data.breakdown} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <HeatmapChart breakdown={data.breakdown} />
          <LeadTimesChart breakdown={data.breakdown} />
        </div>
        <ActivityCalendar activity={data.activity} />

        <div className="grid gap-6 lg:grid-cols-3">
          <PickupList data={data} />
          <PendingChargesList data={data} />
          <LowStockList data={data} />
        </div>
      </div>
    </>
  );
}

/** Second row of indicators (SPEC §9) as compact stats. */
function MoreKpis({ k }: { k: KpiSummary }) {
  const t = useTranslations("dashboard.more");
  const f = useFormat();
  const days = (v: number | null) => (v === null ? t("none") : f.number(v, 1));
  return (
    <Card data-testid="kpi-more">
      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 xl:grid-cols-5">
        <Stat label={t("discounts")} value={<Money value={k.discounts} />} />
        <Stat
          label={t("cancellation")}
          value={k.cancellation_rate === null ? t("none") : f.percent(k.cancellation_rate, 1)}
          hint={t("cancellationHint", { cancelled: k.cancelled, created: k.created })}
        />
        <Stat label={t("owed")} value={<Money value={k.owed_to_suppliers} className={k.owed_to_suppliers > 0 ? "text-attention-text" : undefined} />} hint={t("owedHint")} />
        <Stat label={t("damaged")} value={t("damagedValue", { count: k.damaged_frames })} />
        <Stat
          label={t("loyal")}
          value={f.number(k.loyal_clients)}
          hint={t("loyalHint", { loyal: k.loyal_clients, served: k.served_clients, rate: k.repeat_rate === null ? t("none") : f.percent(k.repeat_rate) })}
        />
        <Stat
          label={t("workshop")}
          value={k.workshop_days_in_store === null ? t("none") : t("workshopValue", { days: days(k.workshop_days_in_store) })}
          hint={k.workshop_days_delivered === null ? undefined : t("workshopHint", { days: days(k.workshop_days_delivered) })}
          className="col-span-2 sm:col-span-1"
        />
      </CardContent>
    </Card>
  );
}

function ListCard({ title, icon: Icon, href, count, children, testId }: { title: string; icon: LucideIcon; href: string; count: ReactNode; children: ReactNode; testId: string }) {
  const t = useTranslations("dashboard.lists");
  return (
    <Card className="gap-3" data-testid={testId}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
          {title}
          <span className="num rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{count}</span>
        </CardTitle>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href={href}>
              {t("seeAll")}
              <ArrowRight />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function PickupList({ data }: { data: DashboardData }) {
  const t = useTranslations();
  const f = useFormat();
  const readyWhatsAppHref = useReadyWhatsAppHref();
  return (
    <ListCard title={t("dashboard.lists.pickup")} icon={Glasses} href="/orders?view=list" count={data.pickup.total} testId="widget-pickup">
      {data.pickup.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("dashboard.lists.pickupEmpty")}</p>
      ) : (
        <ul className="-mx-2 divide-y">
          {data.pickup.rows.map((row) => {
            const wa = readyWhatsAppHref(row);
            const days = f.daysSince(row.statusSince);
            return (
              <li key={row.id} className="flex items-center gap-2 px-2 py-2">
                <Link href={`/orders/${row.id}`} className="min-w-0 flex-1 rounded-lg hover:underline">
                  <span className="block truncate text-sm font-medium">{row.clientName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    <span className="num">{row.displayNumber}</span> · {row.storeName} ·{" "}
                    <span className={days > 5 ? "font-semibold text-destructive" : undefined}>{t("dashboard.lists.waiting", { count: days })}</span>
                  </span>
                </Link>
                <ResteBadge reste={row.balance} compact />
                {wa && (
                  <Button asChild variant="ghost" size="icon-sm" className="text-whatsapp" aria-label={`${t("orders.whatsappNotify")} · ${row.clientName}`}>
                    <a href={wa} target="_blank" rel="noopener noreferrer">
                      <WhatsAppIcon />
                    </a>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ListCard>
  );
}

function PendingChargesList({ data }: { data: DashboardData }) {
  const t = useTranslations("dashboard.lists");
  const locale = useLocale();
  const f = useFormat();
  const k = data.summary;
  return (
    <ListCard
      title={t("pending")}
      icon={CalendarClock}
      href="/charges"
      count={k.pending_charges_count}
      testId="widget-pending"
    >
      {k.pending_charges_count > 0 && (
        <p className="mb-1 text-xs text-muted-foreground">
          <Money value={k.pending_charges_amount} className="font-semibold text-attention-text" />
        </p>
      )}
      {data.pendingCharges.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("pendingEmpty")}</p>
      ) : (
        <ul className="-mx-2 divide-y">
          {data.pendingCharges.map((c) => (
            <li key={c.id}>
              <Link href="/charges" className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/60">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.reason}</span>
                  <span className="num block truncate text-xs text-muted-foreground">
                    {f.date(c.chargeDate)} · {localized(c.location, locale)}
                  </span>
                </span>
                <Money value={c.amount} className="text-sm font-medium" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ListCard>
  );
}

function LowStockList({ data }: { data: DashboardData }) {
  const t = useTranslations("dashboard.lists");
  return (
    <ListCard title={t("lowStock")} icon={AlertTriangle} href="/stock" count={data.lowStock.total} testId="widget-low-stock">
      {data.lowStock.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("lowStockEmpty")}</p>
      ) : (
        <ul className="-mx-2 divide-y">
          {data.lowStock.rows.map((s) => (
            <li key={`${s.storeId}|${s.categoryId}`}>
              <Link href={`/stock?location=${s.storeId}`} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/60">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.categoryName}</span>
                  <span className="block truncate text-xs text-muted-foreground">{s.storeName}</span>
                </span>
                <span className="num rounded-lg bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">{t("left", { qty: s.quantity, min: s.min })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ListCard>
  );
}
