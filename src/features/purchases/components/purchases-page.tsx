"use client";

import { Archive, ArchiveRestore, Banknote, Eye, MoreVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Money, ResteBadge } from "@/components/shared/badges";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { EmptyState, PageHeader, Stat } from "@/components/shared/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { useSettingsAction } from "@/features/settings/use-settings-action";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useFormat } from "@/lib/use-format";
import { deleteSupplier, setSupplierArchived } from "../actions";
import type { PurchaseReference, PurchaseRow, SupplierRow } from "../queries";
import { PaymentDialog, type PaymentTarget } from "./payment-dialog";
import { PurchaseFormDialog } from "./purchase-form-dialog";
import { SupplierDialog, type SupplierDraft } from "./supplier-dialog";

type Tab = "purchases" | "suppliers";

function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Purchasing (SPEC §8, super admin): purchases with what is left to pay, and suppliers with what is owed. */
export function PurchasesPage({
  tab,
  purchases,
  suppliers,
  summary,
  reference,
}: {
  tab: Tab;
  purchases: PurchaseRow[];
  suppliers: SupplierRow[];
  summary: { owed: number; unpaidCount: number; totalBought: number };
  reference: PurchaseReference;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [current, setCurrent] = useState<Tab>(tab);
  const [formOpen, setFormOpen] = useState(false);
  const [supplierEdit, setSupplierEdit] = useState<SupplierDraft | null>(null);
  const [supplierOpen, setSupplierOpen] = useState(false);

  const changeTab = (value: string) => {
    const next = value as Tab;
    setCurrent(next);
    router.replace({ pathname, query: next === "purchases" ? {} : { tab: next } }, { scroll: false });
  };

  return (
    <>
      <PageHeader
        title={t("pages.purchases.title")}
        description={t("pages.purchases.description")}
        actions={
          current === "purchases" ? (
            <Button onClick={() => setFormOpen(true)}>
              <Plus />
              {t("purchases.new")}
            </Button>
          ) : (
            <Button
              onClick={() => {
                setSupplierEdit(null);
                setSupplierOpen(true);
              }}
            >
              <Plus />
              {t("purchases.suppliers.new")}
            </Button>
          )
        }
      />

      <Tabs value={current} onValueChange={changeTab} className="mb-5">
        <TabsList>
          <TabsTrigger value="purchases" className="px-4">
            {t("purchases.tabs.purchases")}
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="px-4">
            {t("purchases.tabs.suppliers")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {current === "purchases" ? (
        <PurchasesTab purchases={purchases} summary={summary} reference={reference} onNew={() => setFormOpen(true)} />
      ) : (
        <SuppliersTab
          suppliers={suppliers}
          onEdit={(s) => {
            setSupplierEdit(s);
            setSupplierOpen(true);
          }}
        />
      )}

      <PurchaseFormDialog open={formOpen} reference={reference} onClose={() => setFormOpen(false)} />
      <SupplierDialog open={supplierOpen} supplier={supplierEdit} onClose={() => setSupplierOpen(false)} />
    </>
  );
}

function PurchasesTab({
  purchases,
  summary,
  reference,
  onNew,
}: {
  purchases: PurchaseRow[];
  summary: { owed: number; unpaidCount: number; totalBought: number };
  reference: PurchaseReference;
  onNew: () => void;
}) {
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [paying, setPaying] = useState<PaymentTarget | null>(null);

  const filtered = useMemo(() => {
    const query = fold(q.trim());
    return purchases.filter(
      (p) =>
        (!unpaidOnly || p.remaining > 0) &&
        (!query || fold(p.supplierName).includes(query) || fold(p.supplierRef ?? "").includes(query) || fold(p.receiveStoreName).includes(query)),
    );
  }, [purchases, q, unpaidOnly]);

  const open = (p: PurchaseRow) => router.push(`/purchases/${p.id}`);
  const payTarget = (p: PurchaseRow): PaymentTarget => ({ purchaseId: p.id, supplierName: p.supplierName, remaining: p.remaining });

  const columns: Column<PurchaseRow>[] = [
    { id: "date", header: t("purchases.columns.date"), sortValue: (p) => p.purchaseDate + p.createdAt, cell: (p) => <span className="num whitespace-nowrap">{f.date(p.purchaseDate)}</span> },
    { id: "supplier", header: t("purchases.columns.supplier"), sortValue: (p) => p.supplierName, cell: (p) => <span className="font-medium">{p.supplierName}</span> },
    { id: "location", header: t("purchases.columns.receivedAt"), hideBelow: "lg", sortValue: (p) => p.receiveStoreName, cell: (p) => <span className="text-muted-foreground">{p.receiveStoreName}</span> },
    { id: "ref", header: t("purchases.columns.ref"), hideBelow: "xl", cell: (p) => <span className="num text-muted-foreground">{p.supplierRef ?? "—"}</span> },
    { id: "total", header: t("purchases.columns.total"), align: "right", sortValue: (p) => p.total, cell: (p) => <Money value={p.total} className="font-medium" /> },
    { id: "paid", header: t("purchases.columns.paid"), align: "right", hideBelow: "lg", sortValue: (p) => p.paid, cell: (p) => <Money value={p.paid} className="text-muted-foreground" /> },
    { id: "remaining", header: t("purchases.columns.remaining"), align: "right", sortValue: (p) => p.remaining, cell: (p) => <ResteBadge reste={p.remaining} compact /> },
    {
      id: "actions",
      header: <span className="sr-only">{t("common.actions")}</span>,
      align: "right",
      cell: (p) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {p.remaining > 0 && (
            <Button variant="ghost" size="icon-sm" onClick={() => setPaying(payTarget(p))} aria-label={`${t("purchases.actions.addPayment")} · ${p.supplierName}`} title={t("purchases.actions.addPayment")}>
              <Banknote />
            </Button>
          )}
          <Button asChild variant="ghost" size="icon-sm" aria-label={`${t("purchases.actions.view")} · ${p.supplierName}`} title={t("purchases.actions.view")}>
            <Link href={`/purchases/${p.id}`}>
              <Eye />
            </Link>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Card className="mb-5">
        <CardContent className="grid grid-cols-2 gap-4">
          <Stat
            label={t("purchases.owed")}
            value={<Money value={summary.owed} className={summary.owed > 0 ? "text-attention-text" : undefined} />}
            hint={t("purchases.owedHint", { count: summary.unpaidCount })}
          />
          <Stat label={t("purchases.bought")} value={<Money value={summary.totalBought} />} />
        </CardContent>
      </Card>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("purchases.searchPlaceholder")} aria-label={t("purchases.searchPlaceholder")} className="pl-9" />
        </div>
        <Toggle
          pressed={unpaidOnly}
          onPressedChange={setUnpaidOnly}
          variant="outline"
          className="h-10 rounded-full px-4 data-[state=on]:border-attention data-[state=on]:bg-attention/10 data-[state=on]:text-attention-text pointer-coarse:h-11 sm:ml-auto"
        >
          <span className="size-2 rounded-full bg-attention" aria-hidden="true" />
          {t("purchases.unpaidOnly")}
        </Toggle>
      </div>

      <Card className="py-0">
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={(p) => p.id}
          initialSort={{ id: "date", desc: true }}
          onRowClick={open}
          caption={t("purchases.tabs.purchases")}
          empty={
            purchases.length === 0 ? (
              <EmptyState
                illustration="box"
                title={t("purchases.empty")}
                body={t("purchases.emptyBody")}
                action={
                  <Button onClick={onNew}>
                    <Plus />
                    {t("purchases.new")}
                  </Button>
                }
              />
            ) : (
              <EmptyState title={t("common.noResults")} body={t("common.noResultsBody")} />
            )
          }
          mobileCard={(p) => (
            <Link href={`/purchases/${p.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-muted">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.supplierName}</span>
                <span className="num block truncate text-xs text-muted-foreground">
                  {f.date(p.purchaseDate)} · {p.receiveStoreName}
                </span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <Money value={p.total} className="text-sm font-semibold" />
                <ResteBadge reste={p.remaining} compact />
              </span>
            </Link>
          )}
        />
      </Card>

      <PaymentDialog target={paying} methods={reference.methods} onClose={() => setPaying(null)} />
    </>
  );
}

function SuppliersTab({ suppliers, onEdit }: { suppliers: SupplierRow[]; onEdit: (s: SupplierDraft) => void }) {
  const t = useTranslations();
  const f = useFormat();
  const run = useSettingsAction();
  const [showArchived, setShowArchived] = useState(false);
  const [deleting, setDeleting] = useState<SupplierRow | null>(null);
  const rows = suppliers.filter((s) => showArchived || !s.isArchived);

  const archive = (s: SupplierRow, archived: boolean) =>
    void run(() => setSupplierArchived({ id: s.id, archived }), t(archived ? "purchases.suppliers.archivedDone" : "purchases.suppliers.restoredDone"));

  const menu = (s: SupplierRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t("purchases.suppliers.more", { name: s.name })} onClick={(e) => e.stopPropagation()}>
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit({ id: s.id, name: s.name, phone: s.phone, note: s.note })}>
          <Pencil />
          {t("purchases.suppliers.edit")}
        </DropdownMenuItem>
        {s.isArchived ? (
          <DropdownMenuItem onSelect={() => archive(s, false)}>
            <ArchiveRestore />
            {t("purchases.suppliers.restore")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => archive(s, true)}>
            <Archive />
            {t("purchases.suppliers.archive")}
          </DropdownMenuItem>
        )}
        {s.purchasesCount === 0 && (
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(s)}>
            <Trash2 />
            {t("purchases.suppliers.delete")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns: Column<SupplierRow>[] = [
    {
      id: "name",
      header: t("purchases.suppliers.columns.name"),
      sortValue: (s) => s.name,
      cell: (s) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{s.name}</span>
          {s.isArchived && <Badge variant="secondary">{t("purchases.suppliers.archived")}</Badge>}
        </span>
      ),
    },
    { id: "phone", header: t("purchases.suppliers.columns.phone"), hideBelow: "lg", cell: (s) => <span className="num text-muted-foreground">{s.phone ?? "—"}</span> },
    { id: "purchases", header: t("purchases.suppliers.columns.purchases"), align: "right", hideBelow: "lg", sortValue: (s) => s.purchasesCount, cell: (s) => <span className="num">{s.purchasesCount}</span> },
    { id: "bought", header: t("purchases.suppliers.columns.totalBought"), align: "right", sortValue: (s) => s.totalBought, cell: (s) => <Money value={s.totalBought} /> },
    { id: "owed", header: t("purchases.suppliers.columns.owed"), align: "right", sortValue: (s) => s.owed, cell: (s) => (s.purchasesCount ? <ResteBadge reste={s.owed} compact /> : <span className="text-muted-foreground">—</span>) },
    {
      id: "last",
      header: t("purchases.suppliers.columns.lastPurchase"),
      hideBelow: "xl",
      sortValue: (s) => s.lastPurchaseDate ?? "",
      cell: (s) => <span className="num text-muted-foreground">{s.lastPurchaseDate ? f.date(s.lastPurchaseDate) : "—"}</span>,
    },
    { id: "actions", header: <span className="sr-only">{t("common.actions")}</span>, align: "right", cell: menu },
  ];

  return (
    <>
      <div className="mb-5 flex justify-end">
        <Toggle pressed={showArchived} onPressedChange={setShowArchived} variant="outline" className="h-10 rounded-full px-4 pointer-coarse:h-11">
          {t("purchases.suppliers.showArchived")}
        </Toggle>
      </div>
      <Card className="py-0">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(s) => s.id}
          initialSort={{ id: "owed", desc: true }}
          onRowClick={(s) => onEdit({ id: s.id, name: s.name, phone: s.phone, note: s.note })}
          caption={t("purchases.tabs.suppliers")}
          empty={<EmptyState illustration="box" title={t("purchases.suppliers.empty")} body={t("purchases.suppliers.emptyBody")} />}
          mobileCard={(s) => (
            <div className="flex items-center gap-3 py-3 pr-2 pl-4">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {s.name}
                  {s.isArchived && <span className="text-xs font-normal text-muted-foreground"> · {t("purchases.suppliers.archived")}</span>}
                </span>
                <span className="num block truncate text-xs text-muted-foreground">
                  {s.purchasesCount} · <Money value={s.totalBought} />
                </span>
              </span>
              {s.purchasesCount > 0 && <ResteBadge reste={s.owed} compact />}
              {menu(s)}
            </div>
          )}
        />
      </Card>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("purchases.suppliers.deleteTitle", { name: deleting?.name ?? "" })}
        description={t("purchases.suppliers.deleteBody")}
        confirmLabel={t("purchases.suppliers.delete")}
        onConfirm={async () => {
          if (deleting) await run(() => deleteSupplier({ id: deleting.id }), t("purchases.suppliers.deleted"));
          setDeleting(null);
        }}
      />
    </>
  );
}
