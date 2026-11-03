"use client";

import { Loader2, Search, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { SegmentBadge, WhatsAppIcon } from "@/components/shared/badges";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { initials } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { useFormat } from "@/lib/use-format";
import type { ClientDirectory, ClientListRow } from "../queries";
import { CLIENT_SORTS, type ClientSort, type SegmentFilter } from "../schemas";
import { ClientFormDialog } from "./client-form-dialog";

interface Filters {
  q: string;
  segment: SegmentFilter;
  sort: ClientSort;
  limit: number;
}

/** Clients are shared by every store; counts cover all stores (SPEC §8, §11). */
export function ClientsPage({ data, filters }: { data: ClientDirectory; filters: Filters }) {
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);
  const [createOpen, setCreateOpen] = useState(false);

  const navigate = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    const query: Record<string, string> = {};
    if (next.q) query.q = next.q;
    if (next.segment !== "all") query.segment = next.segment;
    if (next.sort !== "recent") query.sort = next.sort;
    if (next.limit !== 50) query.limit = String(next.limit);
    startTransition(() => router.replace({ pathname, query }, { scroll: false }));
  };

  // Search a moment after typing stops.
  useEffect(() => {
    if (q.trim() === filters.q) return;
    const timer = setTimeout(() => navigate({ q: q.trim(), limit: 50 }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the typed text triggers a search
  }, [q]);

  const columns: Column<ClientListRow>[] = [
    {
      id: "name",
      header: t("clients.columns.name"),
      cell: (r) => (
        <Link href={`/clients/${r.id}`} className="flex items-center gap-3 font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{initials(r.full_name)}</span>
          {r.full_name}
        </Link>
      ),
    },
    {
      id: "phone",
      header: t("clients.columns.phone"),
      cell: (r) => (
        <span className="num flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
          {r.has_whatsapp ? <WhatsAppIcon className="text-whatsapp" /> : <span className="size-4" />}
          {formatPhone(r.phone_e164)}
        </span>
      ),
    },
    { id: "orders", header: t("clients.columns.orders"), align: "right", cell: (r) => <span className="num">{r.orders}</span> },
    {
      id: "last",
      header: t("clients.columns.lastVisit"),
      hideBelow: "lg",
      cell: (r) => <span className="num text-muted-foreground">{r.last_order_at ? f.date(r.last_order_at) : t("clients.never")}</span>,
    },
    { id: "segment", header: t("clients.columns.segment"), cell: (r) => <SegmentBadge segment={r.segment} /> },
  ];

  const total = data.counts[filters.segment];

  return (
    <>
      <PageHeader
        title={t("clients.title")}
        description={t("clients.descriptionShared")}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus />
            {t("clients.newClient")}
          </Button>
        }
      />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("clients.searchPlaceholder")}
            aria-label={t("clients.searchPlaceholder")}
            className="pl-9"
            data-testid="clients-search"
          />
          {pending && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />}
        </div>
        <ChoiceChips
          label={t("clients.columns.segment")}
          value={filters.segment}
          onChange={(v) => navigate({ segment: v as SegmentFilter, limit: 50 })}
          options={[
            { value: "all", label: `${t("clients.all")} · ${data.counts.all}` },
            { value: "new", label: `${t("segment.new")} · ${data.counts.new}` },
            { value: "regular", label: `${t("segment.regular")} · ${data.counts.regular}` },
            { value: "loyal", label: `${t("segment.loyal")} · ${data.counts.loyal}` },
          ]}
        />
        <Select value={filters.sort} onValueChange={(v) => navigate({ sort: v as ClientSort })}>
          <SelectTrigger className="w-full lg:ml-auto lg:w-52" aria-label={t("clients.sortLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CLIENT_SORTS.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`clients.sorts.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Card className="py-0">
        <DataTable
          rows={data.rows}
          columns={columns}
          rowKey={(r) => r.id}
          pageSize={200}
          onRowClick={(r) => router.push(`/clients/${r.id}`)}
          caption={t("clients.title")}
          empty={
            data.counts.all === 0 && !filters.q ? (
              <EmptyState illustration="clients" title={t("clients.empty")} body={t("clients.emptyBody")} />
            ) : (
              <EmptyState illustration="search" title={t("common.noResults")} body={t("common.noResultsBody")} />
            )
          }
          mobileCard={(r) => (
            <Link href={`/clients/${r.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-muted">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">{initials(r.full_name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.full_name}</span>
                <span className="num flex items-center gap-1 text-xs text-muted-foreground">
                  {r.has_whatsapp && <WhatsAppIcon className="size-3.5 text-whatsapp" />}
                  {formatPhone(r.phone_e164)} · {t("wizard.ordersCount", { count: r.orders })}
                </span>
              </span>
              <SegmentBadge segment={r.segment} />
            </Link>
          )}
        />
      </Card>
      {data.rows.length < total && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => navigate({ limit: Math.min(200, filters.limit + 50) })} disabled={pending || filters.limit >= 200}>
            {t("clients.showMore", { shown: data.rows.length, total })}
          </Button>
        </div>
      )}
      <ClientFormDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={(id) => router.push(`/clients/${id}`)} />
    </>
  );
}
