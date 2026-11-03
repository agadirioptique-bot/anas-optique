"use client";

import { ArrowLeftRight, History, MoreVertical, PackageMinus, Search, SlidersHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState, PageHeader, Stat } from "@/components/shared/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import type { StoreSummary } from "@/features/auth/types";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { Labeled, StockRow } from "../queries";
import { isLowStock } from "../state";
import { MovementsDrawer, type DrawerTarget } from "./movements-drawer";
import { QuantityPill, ThresholdCell } from "./stock-bits";
import { AdjustDialog, DamageDialog } from "./stock-dialogs";
import { TransferDialog, type TransferPreset } from "./transfer-dialog";

function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Stock per location (SPEC §8): quantities only, never money. Super admin: a tab per location and
 * the adjust / damage / transfer actions; secretary: her store, read only, history included.
 */
export function StockPage({
  isSuperAdmin,
  locations,
  initialLocationId,
  rows,
  reasons,
}: {
  isSuperAdmin: boolean;
  locations: StoreSummary[];
  initialLocationId: string;
  /** Super admin: every location (the transfer dialog needs the source levels). Secretary: her store. */
  rows: StockRow[];
  reasons: Labeled[];
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [locationId, setLocationId] = useState(initialLocationId);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [lowOnly, setLowOnly] = useState(false);
  const [drawer, setDrawer] = useState<{ storeId: string; categoryId: string } | null>(null);
  const [adjust, setAdjust] = useState<{ storeId: string; categoryId: string } | null>(null);
  const [damage, setDamage] = useState<{ storeId: string; categoryId: string } | null>(null);
  const [transfer, setTransfer] = useState<TransferPreset | null>(null);

  const location = locations.find((l) => l.id === locationId);
  const here = useMemo(() => rows.filter((r) => r.storeId === locationId), [rows, locationId]);
  const typeLabel = (r: StockRow) => (locale === "en" && r.typeLabelEn ? r.typeLabelEn : r.typeLabelFr);
  const types = useMemo(() => {
    const seen = new Map<string, StockRow>();
    for (const r of here) if (!seen.has(r.typeKey)) seen.set(r.typeKey, r);
    return [...seen.values()];
  }, [here]);

  const filtered = useMemo(() => {
    const query = fold(q.trim());
    return here.filter(
      (r) =>
        (type === "all" || r.typeKey === type) &&
        (!lowOnly || isLowStock(r.quantity, r.min)) &&
        (!query || fold(r.categoryName).includes(query) || fold(typeLabel(r)).includes(query)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- typeLabel only depends on locale
  }, [here, type, lowOnly, q, locale]);

  const units = here.reduce((s, r) => s + r.quantity, 0);
  const low = here.filter((r) => isLowStock(r.quantity, r.min)).length;

  // Dialog targets read the live row, so a refresh after a write shows the new level.
  const toTarget = (sel: { storeId: string; categoryId: string } | null): DrawerTarget | null => {
    if (!sel) return null;
    const row = rows.find((r) => r.storeId === sel.storeId && r.categoryId === sel.categoryId);
    if (!row) return null;
    return {
      storeId: row.storeId,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      locationName: locations.find((l) => l.id === row.storeId)?.name ?? "",
      quantity: row.quantity,
    };
  };
  const select = (r: StockRow) => ({ storeId: r.storeId, categoryId: r.categoryId });

  const changeLocation = (id: string) => {
    setLocationId(id);
    setType("all");
    router.replace({ pathname, query: { location: id } }, { scroll: false });
  };

  const columns: Column<StockRow>[] = [
    {
      id: "category",
      header: t("stock.columns.category"),
      sortValue: (r) => r.categoryName,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{r.categoryName}</span>
          {r.isArchived && <Badge variant="secondary">{t("stock.archived")}</Badge>}
        </span>
      ),
    },
    {
      id: "type",
      header: t("stock.columns.type"),
      sortValue: (r) => typeLabel(r),
      hideBelow: "lg",
      cell: (r) => <span className="text-muted-foreground">{typeLabel(r)}</span>,
    },
    {
      id: "qty",
      header: t("stock.columns.quantity"),
      align: "right",
      sortValue: (r) => r.quantity,
      cell: (r) => <QuantityPill qty={r.quantity} min={r.min} />,
    },
    {
      id: "min",
      header: t("stock.columns.threshold"),
      align: "center",
      sortValue: (r) => r.min ?? -1,
      cell: (r) => <ThresholdCell storeId={r.storeId} categoryId={r.categoryId} categoryName={r.categoryName} value={r.min} editable={isSuperAdmin} />,
    },
    {
      id: "actions",
      header: <span className="sr-only">{t("common.actions")}</span>,
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" onClick={() => setDrawer(select(r))} aria-label={`${t("stock.actions.history")} · ${r.categoryName}`} title={t("stock.actions.history")}>
            <History />
          </Button>
          {isSuperAdmin && (
            <>
              <Button variant="ghost" size="icon-sm" onClick={() => setAdjust(select(r))} aria-label={`${t("stock.actions.adjust")} · ${r.categoryName}`} title={t("stock.actions.adjust")}>
                <SlidersHorizontal />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setDamage(select(r))}
                disabled={r.quantity === 0}
                aria-label={`${t("stock.actions.damage")} · ${r.categoryName}`}
                title={t("stock.actions.damage")}
              >
                <PackageMinus />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setTransfer({ fromStoreId: r.storeId, categoryId: r.categoryId })}
                disabled={r.quantity === 0}
                aria-label={`${t("stock.actions.transfer")} · ${r.categoryName}`}
                title={t("stock.actions.transfer")}
              >
                <ArrowLeftRight />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("pages.stock.title")}
        description={isSuperAdmin ? t("pages.stock.description") : t("stock.descriptionScoped", { location: location?.name ?? "" })}
        actions={
          isSuperAdmin && (
            <Button asChild variant="outline">
              <Link href="/stock/transfers">
                <ArrowLeftRight />
                {t("nav.transfers")}
              </Link>
            </Button>
          )
        }
      />

      {isSuperAdmin && locations.length > 1 && (
        <Tabs value={locationId} onValueChange={changeLocation} className="mb-4">
          <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            <TabsList aria-label={t("stock.locations")}>
              {locations.map((l) => (
                <TabsTrigger key={l.id} value={l.id} className="px-4">
                  {l.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
      )}

      <Card className="mb-5">
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label={t("stock.kpi.tracked")} value={here.length} />
          <Stat label={t("stock.kpi.units")} value={units} />
          <Stat label={t("stock.kpi.low")} value={<span className={low ? "text-destructive" : undefined}>{t("stock.kpi.lowValue", { count: low })}</span>} />
        </CardContent>
      </Card>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("stock.searchPlaceholder")} aria-label={t("stock.searchPlaceholder")} className="pl-9" />
        </div>
        <ChoiceChips
          label={t("stock.types")}
          value={type}
          onChange={(v) => setType(v || "all")}
          options={[{ value: "all", label: t("stock.allTypes") }, ...types.map((r) => ({ value: r.typeKey, label: typeLabel(r) }))]}
        />
        <Toggle
          pressed={lowOnly}
          onPressedChange={setLowOnly}
          variant="outline"
          className="h-10 rounded-full px-4 data-[state=on]:border-destructive data-[state=on]:bg-destructive/10 data-[state=on]:text-destructive pointer-coarse:h-11 lg:ml-auto"
        >
          <span className="size-2 rounded-full bg-destructive" aria-hidden="true" />
          {t("stock.lowOnly")}
        </Toggle>
      </div>

      <Card className="py-0">
        <DataTable
          key={locationId}
          rows={filtered}
          columns={columns}
          rowKey={(r) => r.categoryId}
          initialSort={{ id: "qty", desc: false }}
          onRowClick={(r) => setDrawer(select(r))}
          caption={t("pages.stock.title")}
          empty={<EmptyState illustration="stock" title={t("stock.empty")} body={t("common.noResultsBody")} />}
          mobileCard={(r) => (
            <div className="flex items-center gap-1 pr-2">
              <button type="button" onClick={() => setDrawer(select(r))} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left active:bg-muted">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {r.categoryName}
                    {r.isArchived && <span className="text-xs font-normal text-muted-foreground"> · {t("stock.archived")}</span>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{typeLabel(r)}</span>
                </span>
                <span className="text-right">
                  <QuantityPill qty={r.quantity} min={r.min} />
                  {r.min !== null && <span className="num block text-[11px] text-muted-foreground">{t("stock.minShort", { min: r.min })}</span>}
                </span>
              </button>
              {isSuperAdmin && (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={t("stock.actions.more", { category: r.categoryName })}>
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setDrawer(select(r))}>
                      <History />
                      {t("stock.actions.history")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setAdjust(select(r))}>
                      <SlidersHorizontal />
                      {t("stock.actions.adjust")}
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={r.quantity === 0} onSelect={() => setDamage(select(r))}>
                      <PackageMinus />
                      {t("stock.actions.damage")}
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={r.quantity === 0} onSelect={() => setTransfer({ fromStoreId: r.storeId, categoryId: r.categoryId })}>
                      <ArrowLeftRight />
                      {t("stock.actions.transfer")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        />
      </Card>

      <MovementsDrawer target={toTarget(drawer)} isSuperAdmin={isSuperAdmin} onClose={() => setDrawer(null)} />
      {isSuperAdmin && (
        <>
          <AdjustDialog target={toTarget(adjust)} reasons={reasons} onClose={() => setAdjust(null)} />
          <DamageDialog target={toTarget(damage)} onClose={() => setDamage(null)} />
          <TransferDialog open={!!transfer} preset={transfer} locations={locations} levels={rows} onClose={() => setTransfer(null)} />
        </>
      )}
    </>
  );
}
