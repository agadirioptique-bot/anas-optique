"use client";

import { Banknote, Receipt } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Money, ResteBadge } from "@/components/shared/badges";
import { PageHeader } from "@/components/shared/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { localized } from "@/lib/localized";
import { useFormat } from "@/lib/use-format";
import type { Labeled, PurchaseLine, PurchaseRow, SupplierPayment } from "../queries";
import { PaymentDialog, type PaymentTarget } from "./payment-dialog";

/** One purchase: lines, totals, payments (each one created a read-only charge), "Add payment". */
export function PurchaseDetail({
  purchase,
  lines,
  payments,
  users,
  methods,
}: {
  purchase: PurchaseRow;
  lines: PurchaseLine[];
  payments: SupplierPayment[];
  users: Record<string, string>;
  methods: Labeled[];
}) {
  const t = useTranslations("purchases.detail");
  const tp = useTranslations("purchases");
  const locale = useLocale();
  const f = useFormat();
  const [paying, setPaying] = useState<PaymentTarget | null>(null);
  const by = (id: string | null) => (id && users[id]) || "—";

  const item = (l: PurchaseLine) =>
    l.kind === "stock" ? (
      <span>
        <span className="font-medium">{l.categoryName}</span>
        {l.typeLabelFr && (
          <span className="text-xs text-muted-foreground"> · {localized({ label_fr: l.typeLabelFr, label_en: l.typeLabelEn ?? "" }, locale)}</span>
        )}
      </span>
    ) : (
      <span className="font-medium">{l.description}</span>
    );

  return (
    <>
      <PageHeader
        backHref="/purchases"
        title={t("title", { supplier: purchase.supplierName })}
        description={
          <span className="num">
            {f.date(purchase.purchaseDate)} · {t("receivedAt", { location: purchase.receiveStoreName })}
            {purchase.supplierRef ? ` · ${t("ref", { ref: purchase.supplierRef })}` : ""}
          </span>
        }
        actions={
          purchase.remaining > 0 && (
            <Button onClick={() => setPaying({ purchaseId: purchase.id, supplierName: purchase.supplierName, remaining: purchase.remaining })}>
              <Banknote />
              {tp("actions.addPayment")}
            </Button>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle className="text-base">{t("lines")}</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.item")}</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">{t("columns.unitPrice")}</TableHead>
                  <TableHead className="text-right">{t("columns.qty")}</TableHead>
                  <TableHead className="text-right">{t("columns.lineTotal")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-normal">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant={l.kind === "stock" ? "secondary" : "outline"}>{t(`kinds.${l.kind}`)}</Badge>
                        {item(l)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-right sm:table-cell">
                      <Money value={l.unitPrice} className="text-muted-foreground" />
                    </TableCell>
                    <TableCell className="num text-right">{l.qty}</TableCell>
                    <TableCell className="text-right">
                      <Money value={l.lineTotal} className="font-medium" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle className="text-base">{t("payments")}</CardTitle>
            </CardHeader>
            {payments.length === 0 ? (
              <CardContent className="py-5 text-sm text-muted-foreground">{t("noPayments")}</CardContent>
            ) : (
              <ul className="divide-y">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-6 py-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-success/10 text-success-text">
                      <Banknote className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        <Money value={p.amount} /> · {p.method ? localized(p.method, locale) : "—"}
                      </span>
                      <span className="num block truncate text-xs text-muted-foreground">
                        {f.date(p.paidAt)} · {by(p.createdBy)}
                        {p.note ? ` · ${p.note}` : ""}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Receipt className="size-3.5" aria-hidden="true" />
                      {t("chargeCreated")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">{t("total")}</span>
                <Money value={purchase.total} className="font-semibold" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">{t("paid")}</span>
                <Money value={purchase.paid} />
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-sm font-medium">{t("remaining")}</span>
                {purchase.remaining > 0 ? <Money value={purchase.remaining} className="text-2xl font-bold text-attention-text" /> : <ResteBadge reste={0} />}
              </div>
              {purchase.stockQty > 0 && <p className="text-xs text-muted-foreground">{t("items", { count: purchase.stockQty })}</p>}
            </CardContent>
          </Card>
          {(purchase.note || purchase.createdBy) && (
            <Card>
              <CardContent className="space-y-2 text-sm">
                {purchase.note && <p className="whitespace-pre-line">{purchase.note}</p>}
                <p className="num text-xs text-muted-foreground">{t("createdBy", { date: f.dateTime(purchase.createdAt), user: by(purchase.createdBy) })}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <PaymentDialog target={paying} methods={methods} onClose={() => setPaying(null)} />
    </>
  );
}
