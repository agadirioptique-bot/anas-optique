"use client";

import { ArrowRight, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { StoreSummary } from "@/features/auth/types";
import { useFormat } from "@/lib/use-format";
import type { StockRow, TransferRow } from "../queries";
import { TransferDialog } from "./transfer-dialog";

function Route({ from, to, toLabel }: { from: string; to: string; toLabel: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span>{from}</span>
      <ArrowRight className="size-3.5 text-muted-foreground" aria-label={toLabel} />
      <span>{to}</span>
    </span>
  );
}

/** Super admin: transfer history + new transfer (SPEC §11: dedicated page opened from Stock). */
export function TransfersPage({
  transfers,
  users,
  locations,
  levels,
}: {
  transfers: TransferRow[];
  users: Record<string, string>;
  locations: StoreSummary[];
  levels: StockRow[];
}) {
  const t = useTranslations("transfers");
  const tp = useTranslations("pages.transfers");
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const nameOf = (id: string) => locations.find((l) => l.id === id)?.name ?? "—";
  const total = (r: TransferRow) => r.lines.reduce((s, l) => s + l.qty, 0);
  const summary = (r: TransferRow) => r.lines.map((l) => `${l.categoryName} × ${l.qty}`).join(", ");

  const columns: Column<TransferRow>[] = [
    { id: "date", header: t("columns.date"), sortValue: (r) => r.createdAt, cell: (r) => <span className="num whitespace-nowrap">{f.dateTime(r.createdAt)}</span> },
    { id: "route", header: t("columns.route"), cell: (r) => <Route from={nameOf(r.fromStoreId)} to={nameOf(r.toStoreId)} toLabel={t("to")} /> },
    {
      id: "items",
      header: t("columns.items"),
      sortValue: total,
      cell: (r) => (
        <span className="block max-w-sm">
          <span className="num font-medium">{t("total", { count: total(r) })}</span>
          <span className="block truncate text-xs text-muted-foreground" title={summary(r)}>
            {summary(r)}
          </span>
        </span>
      ),
    },
    { id: "note", header: t("columns.note"), hideBelow: "xl", cell: (r) => <span className="text-muted-foreground">{r.note ?? "—"}</span> },
    { id: "by", header: t("columns.by"), hideBelow: "lg", cell: (r) => <span className="text-muted-foreground">{(r.createdBy && users[r.createdBy]) || "—"}</span> },
  ];

  return (
    <>
      <PageHeader
        title={tp("title")}
        description={tp("description")}
        backHref="/stock"
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus />
            {t("new")}
          </Button>
        }
      />
      <h2 className="mb-3 text-base font-semibold">{t("history")}</h2>
      <Card className="py-0">
        <DataTable
          rows={transfers}
          columns={columns}
          rowKey={(r) => r.id}
          initialSort={{ id: "date", desc: true }}
          caption={t("history")}
          empty={<EmptyState illustration="box" title={t("empty")} body={t("emptyBody")} />}
          mobileCard={(r) => (
            <div className="space-y-1 px-4 py-3">
              <div className="flex items-center justify-between gap-2 text-sm font-medium">
                <Route from={nameOf(r.fromStoreId)} to={nameOf(r.toStoreId)} toLabel={t("to")} />
                <span className="num shrink-0">{t("total", { count: total(r) })}</span>
              </div>
              <p className="truncate text-xs text-muted-foreground">{summary(r)}</p>
              <p className="num text-xs text-muted-foreground">
                {f.dateTime(r.createdAt)}
                {r.createdBy && users[r.createdBy] ? ` · ${users[r.createdBy]}` : ""}
                {r.note ? ` · ${r.note}` : ""}
              </p>
            </div>
          )}
        />
      </Card>
      <TransferDialog open={open} preset={null} locations={locations} levels={levels} onClose={() => setOpen(false)} />
    </>
  );
}
