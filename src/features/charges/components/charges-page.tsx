"use client";

import { ArchiveRestore, CalendarClock, Check, ExternalLink, History, Loader2, MoreVertical, Pencil, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Money } from "@/components/shared/badges";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ConfirmDialog, ResponsiveDialog } from "@/components/shared/dialogs";
import { MoneyInput } from "@/components/shared/money-input";
import { EmptyState, PageHeader, Stat } from "@/components/shared/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { useSettingsAction } from "@/features/settings/use-settings-action";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { localized } from "@/lib/localized";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";
import { approveCharge, deleteRecurring, setChargeDeleted, setRecurringActive } from "../actions";
import { PERIODS } from "../lib";
import type { ChargeReference, ChargeRow, ChargeTotals, RecurringRow } from "../queries";
import type { ChargeFilters } from "../schemas";
import { ChargeDialog } from "./charge-dialog";
import { HistoryDrawer } from "./history-drawer";
import { RecurringDialog } from "./recurring-dialog";

const ALL = "all";

/** Charges (SPEC §8, super admin): pending approvals, filtered ledger with sources, recurring charges. */
export function ChargesPage({
  filters,
  range,
  charges,
  totals,
  pending,
  recurring,
  reference,
}: {
  filters: ChargeFilters;
  range: { from: string; to: string };
  charges: ChargeRow[];
  totals: ChargeTotals;
  pending: ChargeRow[];
  recurring: RecurringRow[];
  reference: ChargeReference;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [busy, startTransition] = useTransition();
  const [editing, setEditing] = useState<ChargeRow | null>(null);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [recurringEdit, setRecurringEdit] = useState<RecurringRow | null>(null);
  const [recurringOpen, setRecurringOpen] = useState(false);

  /** Filters live in the URL (server-side filtering); defaults are left out. */
  const navigate = (patch: Partial<ChargeFilters>) => {
    const next = { ...filters, ...patch };
    const query: Record<string, string> = {};
    if (next.tab !== "charges") query.tab = next.tab;
    if (next.period !== "month") query.period = next.period;
    if (next.period === "custom") {
      query.from = next.from ?? range.from;
      query.to = next.to ?? range.to;
    }
    if (next.location) query.location = next.location;
    if (next.category) query.category = next.category;
    if (next.status !== "all") query.status = next.status;
    if (next.deleted === "1") query.deleted = "1";
    startTransition(() => router.replace({ pathname, query }, { scroll: false }));
  };

  const isCharges = filters.tab === "charges";

  return (
    <>
      <PageHeader
        title={t("pages.charges.title")}
        description={t("pages.charges.description")}
        actions={
          isCharges ? (
            <Button
              onClick={() => {
                setEditing(null);
                setChargeOpen(true);
              }}
            >
              <Plus />
              {t("charges.new")}
            </Button>
          ) : (
            <Button
              onClick={() => {
                setRecurringEdit(null);
                setRecurringOpen(true);
              }}
            >
              <Plus />
              {t("charges.newRecurring")}
            </Button>
          )
        }
      />

      <Tabs value={filters.tab} onValueChange={(v) => navigate({ tab: v as ChargeFilters["tab"] })} className="mb-5">
        <TabsList>
          <TabsTrigger value="charges" className="px-4">
            {t("charges.tabs.charges")}
            {pending.length > 0 && <span className="num ml-1.5 rounded-full bg-attention px-1.5 text-[11px] font-semibold text-white">{pending.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="recurring" className="px-4">
            {t("charges.tabs.recurring")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {isCharges ? (
        <div className={cn("space-y-5 transition-opacity", busy && "opacity-60")}>
          {pending.length > 0 && <PendingCard pending={pending} />}
          <Filters filters={filters} range={range} reference={reference} navigate={navigate} busy={busy} />
          <Card>
            <CardContent className="grid grid-cols-2 gap-4">
              <Stat label={t("charges.kpi.approved")} value={<Money value={totals.approvedTotal} />} hint={t("charges.kpi.count", { count: totals.approvedCount })} />
              <Stat
                label={t("charges.kpi.pending")}
                value={<Money value={totals.pendingTotal} className={totals.pendingTotal > 0 ? "text-attention-text" : undefined} />}
                hint={t("charges.kpi.count", { count: totals.pendingCount })}
              />
            </CardContent>
          </Card>
          <Ledger
            charges={charges}
            reference={reference}
            onEdit={(c) => {
              setEditing(c);
              setChargeOpen(true);
            }}
          />
        </div>
      ) : (
        <RecurringTab
          recurring={recurring}
          reference={reference}
          onEdit={(r) => {
            setRecurringEdit(r);
            setRecurringOpen(true);
          }}
        />
      )}

      <ChargeDialog open={chargeOpen} charge={editing} reference={reference} onClose={() => setChargeOpen(false)} />
      <RecurringDialog open={recurringOpen} recurring={recurringEdit} reference={reference} onClose={() => setRecurringOpen(false)} />
    </>
  );
}

function Filters({
  filters,
  range,
  reference,
  navigate,
  busy,
}: {
  filters: ChargeFilters;
  range: { from: string; to: string };
  reference: ChargeReference;
  navigate: (patch: Partial<ChargeFilters>) => void;
  busy: boolean;
}) {
  const t = useTranslations("charges");
  const locale = useLocale();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <ChoiceChips
          label={t("period")}
          value={filters.period}
          onChange={(v) => v && navigate({ period: v as ChargeFilters["period"], from: undefined, to: undefined })}
          options={PERIODS.map((p) => ({ value: p, label: t(`periods.${p}`) }))}
          itemClassName="h-9 px-3 pointer-coarse:h-10"
        />
        {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />}
      </div>
      {filters.period === "custom" && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="charges-from" className="text-xs">
              {t("from")}
            </Label>
            <Input id="charges-from" type="date" value={filters.from ?? range.from} onChange={(e) => e.target.value && navigate({ from: e.target.value })} className="w-44" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="charges-to" className="text-xs">
              {t("to")}
            </Label>
            <Input id="charges-to" type="date" value={filters.to ?? range.to} onChange={(e) => e.target.value && navigate({ to: e.target.value })} className="w-44" />
          </div>
        </div>
      )}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Select value={filters.location ?? ALL} onValueChange={(v) => navigate({ location: v === ALL ? undefined : v })}>
          <SelectTrigger className="w-full lg:w-56" aria-label={t("columns.location")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allLocations")}</SelectItem>
            {reference.locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {localized(l, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.category ?? ALL} onValueChange={(v) => navigate({ category: v === ALL ? undefined : v })}>
          <SelectTrigger className="w-full lg:w-56" aria-label={t("columns.category")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allCategories")}</SelectItem>
            {reference.filterCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {localized(c, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ChoiceChips
          label={t("columns.status")}
          value={filters.status}
          onChange={(v) => v && navigate({ status: v as ChargeFilters["status"] })}
          options={(["all", "approved", "pending"] as const).map((s) => ({ value: s, label: t(`statusFilter.${s}`) }))}
          itemClassName="h-9 px-3 pointer-coarse:h-10"
        />
        <Toggle
          pressed={filters.deleted === "1"}
          onPressedChange={(on) => navigate({ deleted: on ? "1" : "0" })}
          variant="outline"
          className="h-9 rounded-full px-4 pointer-coarse:h-10 lg:ml-auto"
        >
          {t("showDeleted")}
        </Toggle>
      </div>
    </div>
  );
}

function PendingCard({ pending }: { pending: ChargeRow[] }) {
  const t = useTranslations("charges.pending");
  const tc = useTranslations("common");
  const locale = useLocale();
  const f = useFormat();
  const run = useSettingsAction();
  const [working, setWorking] = useState<string | null>(null);
  const [editing, setEditing] = useState<ChargeRow | null>(null);
  const [amount, setAmount] = useState<number | undefined>();
  const [skipping, setSkipping] = useState<ChargeRow | null>(null);

  const approve = async (c: ChargeRow, value?: number) => {
    setWorking(c.id);
    const done = await run(() => approveCharge({ id: c.id, amount: value }), t("approved", { label: c.reason }));
    setWorking(null);
    return done;
  };

  return (
    <Card className="gap-0 border-attention/40 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4 text-attention-text" aria-hidden="true" />
          {t("title")}
          <span className="num rounded-full bg-attention/10 px-2 text-xs font-semibold text-attention-text">{pending.length}</span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </CardHeader>
      <ul className="divide-y">
        {pending.map((c) => (
          <li key={c.id} className="flex flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{c.reason}</span>
              <span className="num block text-xs text-muted-foreground">
                {f.date(c.chargeDate)} · {localized(c.location, locale)} · {localized(c.category, locale)}
              </span>
            </span>
            <Money value={c.amount} className="text-base font-semibold" />
            <span className="flex gap-2">
              <Button size="sm" onClick={() => void approve(c)} disabled={working === c.id}>
                {working === c.id ? <Loader2 className="animate-spin" /> : <Check />}
                {t("approve")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(c);
                  setAmount(c.amount);
                }}
              >
                {t("editAmount")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSkipping(c)}>
                {t("skip")}
              </Button>
            </span>
          </li>
        ))}
      </ul>

      <ResponsiveDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={t("editTitle")}
        description={editing?.reason}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              {tc("cancel")}
            </Button>
            <Button
              disabled={!amount || amount <= 0 || working === editing?.id}
              onClick={async () => {
                if (editing && amount && (await approve(editing, amount))) setEditing(null);
              }}
            >
              {working === editing?.id && <Loader2 className="animate-spin" />}
              {t("confirm")}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="pending-amount">{t("amount")}</Label>
          <MoneyInput id="pending-amount" value={amount} onChange={setAmount} size="lg" />
        </div>
      </ResponsiveDialog>

      <ConfirmDialog
        open={!!skipping}
        onOpenChange={(o) => !o && setSkipping(null)}
        title={t("skipTitle", { label: skipping?.reason ?? "" })}
        description={t("skipBody")}
        confirmLabel={t("skip")}
        onConfirm={async () => {
          if (skipping) await run(() => setChargeDeleted({ id: skipping.id, deleted: true }), t("skipped", { label: skipping.reason }));
          setSkipping(null);
        }}
      />
    </Card>
  );
}

function SourceBadge({ row }: { row: ChargeRow }) {
  const t = useTranslations("charges");
  const icon = row.source === "supplier" ? <ShoppingCart className="size-3" aria-hidden="true" /> : row.source === "recurring" ? <CalendarClock className="size-3" aria-hidden="true" /> : null;
  const badge = (
    <Badge variant={row.source === "manual" ? "outline" : "secondary"} className="gap-1 whitespace-nowrap">
      {icon}
      {t(`sources.${row.source}`)}
    </Badge>
  );
  return row.source === "supplier" && row.purchaseId ? (
    <Link href={`/purchases/${row.purchaseId}`} title={t("actions.openPurchase")} onClick={(e) => e.stopPropagation()}>
      {badge}
    </Link>
  ) : (
    badge
  );
}

function StatusBadge({ row }: { row: ChargeRow }) {
  const t = useTranslations("charges");
  if (row.isDeleted) return <Badge variant="outline" className="text-muted-foreground">{t("deleted")}</Badge>;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
        row.status === "pending" ? "bg-attention/10 text-attention-text" : "bg-success/10 text-success-text",
      )}
    >
      {t(`statuses.${row.status}`)}
    </span>
  );
}

function Ledger({ charges, reference, onEdit }: { charges: ChargeRow[]; reference: ChargeReference; onEdit: (c: ChargeRow) => void }) {
  const t = useTranslations("charges");
  const tc = useTranslations("common");
  const locale = useLocale();
  const f = useFormat();
  const run = useSettingsAction();
  const [history, setHistory] = useState<ChargeRow | null>(null);
  const [deleting, setDeleting] = useState<ChargeRow | null>(null);

  const menu = (c: ChargeRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t("actions.more", { reason: c.reason })} onClick={(e) => e.stopPropagation()}>
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setHistory(c)}>
          <History />
          {t("actions.history")}
        </DropdownMenuItem>
        {c.source === "supplier" ? (
          c.purchaseId && (
            <DropdownMenuItem asChild>
              <Link href={`/purchases/${c.purchaseId}`}>
                <ShoppingCart />
                {t("actions.openPurchase")}
              </Link>
            </DropdownMenuItem>
          )
        ) : c.isDeleted ? (
          <DropdownMenuItem onSelect={() => void run(() => setChargeDeleted({ id: c.id, deleted: false }), t("restoredDone"))}>
            <ArchiveRestore />
            {t("actions.restore")}
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem onSelect={() => onEdit(c)}>
              <Pencil />
              {t("actions.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(c)}>
              <Trash2 />
              {t("actions.delete")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns: Column<ChargeRow>[] = [
    { id: "date", header: t("columns.date"), sortValue: (c) => c.chargeDate + c.createdAt, cell: (c) => <span className="num whitespace-nowrap">{f.date(c.chargeDate)}</span> },
    { id: "category", header: t("columns.category"), sortValue: (c) => localized(c.category, locale), cell: (c) => localized(c.category, locale) },
    { id: "location", header: t("columns.location"), hideBelow: "lg", sortValue: (c) => localized(c.location, locale), cell: (c) => <span className="text-muted-foreground">{localized(c.location, locale)}</span> },
    { id: "reason", header: t("columns.reason"), cell: (c) => <span className="line-clamp-2 max-w-64">{c.reason}</span> },
    {
      id: "amount",
      header: t("columns.amount"),
      align: "right",
      sortValue: (c) => c.amount,
      cell: (c) => <Money value={c.amount} className={cn("font-medium", c.isDeleted && "text-muted-foreground line-through")} />,
    },
    {
      id: "order",
      header: t("columns.order"),
      hideBelow: "xl",
      cell: (c) =>
        c.orderId && c.orderNumber ? (
          <Link href={`/orders/${c.orderId}`} className="num inline-flex items-center gap-1 text-primary hover:underline" onClick={(e) => e.stopPropagation()} title={t("actions.openOrder", { number: c.orderNumber })}>
            {c.orderNumber}
            <ExternalLink className="size-3" aria-hidden="true" />
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { id: "source", header: t("columns.source"), hideBelow: "lg", sortValue: (c) => c.source, cell: (c) => <SourceBadge row={c} /> },
    { id: "status", header: t("columns.status"), sortValue: (c) => (c.isDeleted ? "z" : c.status), cell: (c) => <StatusBadge row={c} /> },
    { id: "actions", header: <span className="sr-only">{tc("actions")}</span>, align: "right", cell: menu },
  ];

  return (
    <>
      <Card className="py-0">
        <DataTable
          rows={charges}
          columns={columns}
          rowKey={(c) => c.id}
          initialSort={{ id: "date", desc: true }}
          onRowClick={setHistory}
          caption={t("tabs.charges")}
          rowClassName={(c) => (c.isDeleted ? "opacity-60" : undefined)}
          empty={<EmptyState illustration="chart" title={t("empty")} body={t("emptyBody")} />}
          mobileCard={(c) => (
            <div className={cn("flex items-center gap-3 py-3 pr-2 pl-4", c.isDeleted && "opacity-60")}>
              <button type="button" onClick={() => setHistory(c)} className="min-w-0 flex-1 text-left">
                <span className="block truncate font-medium">{c.reason}</span>
                <span className="num block truncate text-xs text-muted-foreground">
                  {f.date(c.chargeDate)} · {localized(c.category, locale)} · {localized(c.location, locale)}
                </span>
                <span className="mt-1 flex flex-wrap gap-1.5">
                  <SourceBadge row={c} />
                  <StatusBadge row={c} />
                </span>
              </button>
              <Money value={c.amount} className={cn("text-sm font-semibold", c.isDeleted && "line-through")} />
              {menu(c)}
            </div>
          )}
        />
      </Card>
      <HistoryDrawer charge={history} reference={reference} onClose={() => setHistory(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("deleteTitle")}
        description={t("deleteBody")}
        confirmLabel={t("actions.delete")}
        onConfirm={async () => {
          if (deleting) await run(() => setChargeDeleted({ id: deleting.id, deleted: true }), t("deletedDone"));
          setDeleting(null);
        }}
      />
    </>
  );
}

function RecurringTab({ recurring, reference, onEdit }: { recurring: RecurringRow[]; reference: ChargeReference; onEdit: (r: RecurringRow) => void }) {
  const t = useTranslations("charges.recurring");
  const tc = useTranslations("common");
  const locale = useLocale();
  const run = useSettingsAction();
  const [deleting, setDeleting] = useState<RecurringRow | null>(null);
  const label = (id: string) => (reference.labels[id] ? localized(reference.labels[id], locale) : "—");

  const toggle = (r: RecurringRow, active: boolean) => void run(() => setRecurringActive({ id: r.id, active }), t(active ? "activated" : "deactivated"));

  const menu = (r: RecurringRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t("more", { label: r.label })} onClick={(e) => e.stopPropagation()}>
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(r)}>
          <Pencil />
          {t("edit")}
        </DropdownMenuItem>
        {r.generated === 0 && (
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(r)}>
            <Trash2 />
            {t("delete")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns: Column<RecurringRow>[] = [
    { id: "label", header: t("columns.label"), sortValue: (r) => r.label, cell: (r) => <span className={cn("font-medium", !r.isActive && "text-muted-foreground")}>{r.label}</span> },
    { id: "amount", header: t("columns.amount"), align: "right", sortValue: (r) => r.amount, cell: (r) => <Money value={r.amount} /> },
    { id: "category", header: t("columns.category"), hideBelow: "lg", cell: (r) => <span className="text-muted-foreground">{label(r.categoryId)}</span> },
    { id: "location", header: t("columns.location"), hideBelow: "lg", cell: (r) => <span className="text-muted-foreground">{label(r.locationId)}</span> },
    { id: "day", header: t("columns.day"), sortValue: (r) => r.dayOfMonth, cell: (r) => <span className="num">{t("dayValue", { day: r.dayOfMonth })}</span> },
    {
      id: "active",
      header: t("columns.active"),
      align: "center",
      cell: (r) => <Switch checked={r.isActive} onCheckedChange={(on) => toggle(r, on)} onClick={(e) => e.stopPropagation()} aria-label={t("toggle", { label: r.label })} />,
    },
    { id: "actions", header: <span className="sr-only">{tc("actions")}</span>, align: "right", cell: menu },
  ];

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">{t("hint")}</p>
      <Card className="py-0">
        <DataTable
          rows={recurring}
          columns={columns}
          rowKey={(r) => r.id}
          initialSort={{ id: "day", desc: false }}
          onRowClick={onEdit}
          caption={t("columns.label")}
          empty={<EmptyState illustration="chart" title={t("empty")} body={t("emptyBody")} />}
          mobileCard={(r) => (
            <div className="flex items-center gap-3 py-3 pr-2 pl-4">
              <button type="button" onClick={() => onEdit(r)} className="min-w-0 flex-1 text-left">
                <span className={cn("block truncate font-medium", !r.isActive && "text-muted-foreground")}>{r.label}</span>
                <span className="num block truncate text-xs text-muted-foreground">
                  {t("dayValue", { day: r.dayOfMonth })} · {label(r.locationId)}
                </span>
              </button>
              <Money value={r.amount} className="text-sm font-semibold" />
              <Switch checked={r.isActive} onCheckedChange={(on) => toggle(r, on)} aria-label={t("toggle", { label: r.label })} />
              {menu(r)}
            </div>
          )}
        />
      </Card>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("deleteTitle", { label: deleting?.label ?? "" })}
        description={t("deleteBody")}
        confirmLabel={t("delete")}
        onConfirm={async () => {
          if (deleting) await run(() => deleteRecurring({ id: deleting.id }), t("deleted"));
          setDeleting(null);
        }}
      />
    </>
  );
}
