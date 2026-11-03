"use client";

import { KanbanSquare, List, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { ResteBadge, StatusBadge, WhatsAppIcon } from "@/components/shared/badges";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/orders";
import { formatPhone } from "@/lib/phone";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";
import type { Labeled } from "../new/data";
import type { OrderRow } from "../queries";
import { ORDER_PERIODS, type OrderListFilters } from "../schemas";
import { OrderActionsProvider } from "./order-actions";
import { OrderBoard } from "./order-board";

function FilterToggle({ pressed, onChange, children }: { pressed: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors pointer-coarse:h-10",
        pressed ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40",
      )}
    >
      {children}
    </button>
  );
}

/** "ben", "06 12", "832", "cnt-832" → matches name, phone or number. */
function matches(row: OrderRow, q: string): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  if (row.clientName.toLowerCase().includes(query)) return true;
  const digits = query.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length >= 4 && row.clientPhone.includes(digits)) return true;
  if (/\d/.test(query)) {
    const number = row.displayNumber.toLowerCase();
    const slip = number.replace(/^[a-z]+-(?:[a-z]+-)?0*/, "");
    return number.includes(query) || slip === digits || slip.startsWith(digits);
  }
  return false;
}

export function OrdersPage({
  rows,
  filters,
  isSuperAdmin,
  showStore,
  scopeName,
  stuckDays,
  methods,
  reasons,
}: {
  rows: OrderRow[];
  filters: OrderListFilters;
  isSuperAdmin: boolean;
  showStore: boolean;
  scopeName: string | null;
  stuckDays: Partial<Record<OrderStatus, number>>;
  methods: Labeled[];
  reasons: Labeled[];
}) {
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [resteDue, setResteDue] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);

  const filtered = useMemo(() => rows.filter((r) => matches(r, q) && (!resteDue || (r.balance > 0 && r.status !== "cancelled"))), [rows, q, resteDue]);

  const setFilters = (patch: Partial<OrderListFilters>) => {
    const next = { ...filters, ...patch };
    const query: Record<string, string> = {};
    if (next.view === "list") {
      query.view = "list";
      if (next.status !== "all") query.status = next.status;
      if (next.period !== "any") query.period = next.period;
    }
    router.replace({ pathname, query }, { scroll: false });
  };

  const columns: Column<OrderRow>[] = [
    {
      id: "number",
      header: t("orders.number"),
      sortValue: (r) => r.displayNumber,
      cell: (r) => (
        <Link href={`/orders/${r.id}`} className="num font-semibold text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          {r.displayNumber}
        </Link>
      ),
    },
    { id: "date", header: t("orders.columns.date"), sortValue: (r) => r.createdAt, cell: (r) => <span className="num whitespace-nowrap text-muted-foreground">{f.date(r.createdAt)}</span> },
    {
      id: "client",
      header: t("orders.columns.client"),
      sortValue: (r) => r.clientName,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.clientName}</p>
          <p className="num flex items-center gap-1 text-xs text-muted-foreground">
            {r.clientHasWhatsapp && <WhatsAppIcon className="size-3 text-whatsapp" />}
            {formatPhone(r.clientPhone)}
          </p>
        </div>
      ),
    },
    ...(showStore ? [{ id: "store", header: t("orders.columns.location"), sortValue: (r: OrderRow) => r.storeName, cell: (r: OrderRow) => <span className="text-muted-foreground">{r.storeName}</span>, hideBelow: "lg" as const }] : []),
    { id: "status", header: t("orders.columns.status"), sortValue: (r) => ORDER_STATUSES.indexOf(r.status), cell: (r) => <StatusBadge status={r.status} /> },
    { id: "total", header: t("orders.columns.total"), align: "right", sortValue: (r) => r.total, cell: (r) => <span className="num font-medium">{f.money(r.total)}</span> },
    {
      id: "reste",
      header: t("orders.columns.reste"),
      align: "right",
      sortValue: (r) => r.balance,
      cell: (r) => (r.status === "cancelled" ? <span className="text-muted-foreground">—</span> : <ResteBadge reste={r.balance} compact />),
    },
  ];

  return (
    <OrderActionsProvider isSuperAdmin={isSuperAdmin} methods={methods} reasons={reasons}>
      <PageHeader
        title={t("orders.title")}
        description={scopeName ? t("orders.descriptionScoped", { location: scopeName }) : t("orders.description")}
        actions={
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/orders/new">
              <Plus />
              {t("nav.newOrder")}
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs value={filters.view} onValueChange={(v) => setFilters({ view: v as OrderListFilters["view"] })}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="board" className="px-4">
              <KanbanSquare />
              {t("orders.board")}
            </TabsTrigger>
            <TabsTrigger value="list" className="px-4">
              <List />
              {t("orders.list")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 lg:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("orders.searchPlaceholder")} aria-label={t("orders.searchPlaceholder")} className="pl-9" type="search" data-testid="orders-search" />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {filters.view === "list" && (
          <>
            <Select value={filters.status} onValueChange={(v) => setFilters({ status: v as OrderListFilters["status"] })}>
              <SelectTrigger className="w-full sm:w-48" aria-label={t("orders.filters.status")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("orders.filters.allStatuses")}</SelectItem>
                {ORDER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`status.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.period} onValueChange={(v) => setFilters({ period: v as OrderListFilters["period"] })}>
              <SelectTrigger className="w-full sm:w-48" aria-label={t("orders.filters.period")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDER_PERIODS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`orders.periods.${p}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
        <FilterToggle pressed={resteDue} onChange={setResteDue}>
          {t("orders.resteDue")}
        </FilterToggle>
        {filters.view === "board" && (
          <FilterToggle pressed={showCancelled} onChange={setShowCancelled}>
            {t("orders.showCancelled")}
          </FilterToggle>
        )}
        {filters.view === "list" && <span className="num ml-auto text-sm text-muted-foreground">{t("orders.count", { count: filtered.length })}</span>}
      </div>

      {filters.view === "board" ? (
        rows.length === 0 ? (
          <EmptyState illustration="orders" title={t("orders.noOrders")} body={t("orders.noOrdersBody")} />
        ) : (
          <OrderBoard rows={filtered} showStore={showStore} showCancelled={showCancelled} stuckDays={stuckDays} />
        )
      ) : (
        <Card className="py-0">
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.id}
            initialSort={{ id: "date", desc: true }}
            onRowClick={(r) => router.push(`/orders/${r.id}`)}
            caption={t("orders.title")}
            empty={<EmptyState illustration="search" title={rows.length ? t("common.noResults") : t("orders.noOrders")} body={rows.length ? t("common.noResultsBody") : t("orders.noOrdersBody")} />}
            mobileCard={(r) => (
              <Link href={`/orders/${r.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-muted">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="num font-semibold text-primary">{r.displayNumber}</span>
                    <span className="text-xs text-muted-foreground">{f.date(r.createdAt)}</span>
                  </div>
                  <p className="truncate text-sm font-medium">{r.clientName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={r.status} />
                    {showStore && <span className="text-xs text-muted-foreground">{r.storeName}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="num text-sm font-semibold">{f.money(r.total)}</span>
                  {r.status !== "cancelled" && <ResteBadge reste={r.balance} compact />}
                </div>
              </Link>
            )}
          />
        </Card>
      )}
    </OrderActionsProvider>
  );
}
