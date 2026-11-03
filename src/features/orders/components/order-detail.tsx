"use client";

import { ArrowLeft, ArrowRight, Ban, Banknote, BadgePercent, Camera, ExternalLink, Glasses, Loader2, MoreHorizontal, Phone, Plus, ReceiptText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { StatusBadge, WhatsAppIcon } from "@/components/shared/badges";
import { PageHeader } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/features/orders/new/components/photo-picker";
import { Link, useRouter } from "@/i18n/navigation";
import { localized } from "@/lib/localized";
import { formatPhone } from "@/lib/phone";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";
import type { OrderDetailData } from "../detail";
import type { Labeled } from "../new/data";
import { uploadPrescriptionPhoto } from "../lib/photo-upload";
import { nextStatus, OrderActionsProvider, previousStatus, readyWhatsAppHref, useOrderActions } from "./order-actions";
import { PrescriptionTable } from "./prescription";
import { StatusTimeline } from "./status-timeline";

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}

function PhotoCard({ data }: { data: OrderDetailData }) {
  const t = useTranslations("detail");
  const tw = useTranslations("wizard");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const cancelled = data.row.status === "cancelled";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{tw("photo")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.photoUrl ? (
          <a href={data.photoUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border">
            {data.order.photoPath?.endsWith(".pdf") ? (
              <span className="flex h-24 items-center justify-center text-sm font-medium text-primary">{t("openPhoto")}</span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
              <img src={data.photoUrl} alt={tw("photo")} className="max-h-80 w-full object-contain" />
            )}
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noPhoto")}</p>
        )}
        {!cancelled && (
          <label className={cn("inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted", busy && "pointer-events-none opacity-60")}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Camera className="size-4" aria-hidden="true" />}
            {data.photoUrl ? t("replacePhoto") : t("addPhoto")}
            <input
              type="file"
              accept={PHOTO_TYPES.join(",")}
              capture="environment"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (!PHOTO_TYPES.includes(file.type) || file.size > PHOTO_MAX_BYTES) {
                  toast.error(tw("photoInvalid"));
                  return;
                }
                setBusy(true);
                const ok = await uploadPrescriptionPhoto(data.row.id, file);
                setBusy(false);
                if (ok) {
                  toast.success(tw("photoStatus.done"));
                  router.refresh();
                } else toast.error(tw("photoStatus.failed"));
              }}
            />
          </label>
        )}
      </CardContent>
    </Card>
  );
}

function Detail({ data, isSuperAdmin }: { data: OrderDetailData; isSuperAdmin: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  const f = useFormat();
  const actions = useOrderActions();
  const { row, order } = data;
  const next = nextStatus(row.status);
  const back = isSuperAdmin ? previousStatus(row.status) : null;
  const whatsapp = row.status === "in_store" ? readyWhatsAppHref(row) : null;
  const active = row.status !== "cancelled" && row.status !== "delivered";
  const canCollect = row.status !== "cancelled" && row.balance > 0;
  const canDiscount = isSuperAdmin && active && row.balance > 0 && order.discountSource !== "client_pending";
  const frame = data.items.find((i) => i.type?.is_frame);
  const others = data.items.filter((i) => !i.type?.is_frame);
  const builtinShown = data.fields.filter((fd) => fd.isBuiltin);
  const visible = (key: string) => builtinShown.find((fd) => fd.key === key)?.visibility !== "hidden";
  const custom = data.fields.filter((fd) => !fd.isBuiltin && order.customValues[fd.key] !== undefined && order.customValues[fd.key] !== "");
  const customLabel = (fd: (typeof custom)[number]) => {
    const raw = order.customValues[fd.key];
    const option = fd.options.find((o) => o.value === raw);
    return option ? (locale === "en" ? option.label_en : option.label_fr) : String(raw);
  };
  const history = [
    ...data.events.filter((e) => e.from !== null).map((e) => ({ at: e.at, by: e.by, text: t("detail.historyStatus", { status: t(`status.${e.to}`) }) })),
    ...data.payments.map((p) => ({
      at: p.at,
      by: p.by,
      text: t("detail.historyPayment", { kind: t(`detail.paymentKinds.${p.kind}`), amount: f.money(p.amount), method: p.method ? localized(p.method, locale) : "—" }),
    })),
    { at: row.createdAt, by: order.createdBy, text: t("detail.historyCreated") },
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <PageHeader
        backHref="/orders"
        title={t("detail.title", { number: row.displayNumber })}
        description={
          <>
            {row.storeName} · {t("detail.createdBy", { date: f.dateTime(row.createdAt), user: order.createdBy ?? "—" })}
          </>
        }
        actions={
          <>
            {whatsapp && (
              <Button asChild variant="whatsapp">
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon />
                  {t("orders.whatsappNotify")}
                </a>
              </Button>
            )}
            {canCollect && (
              <Button variant={row.status === "in_store" ? "attention" : "outline"} onClick={() => actions.collect(row, { deliver: row.status === "in_store" })} data-testid="collect">
                <Banknote />
                {t("detail.collect")}
              </Button>
            )}
            {next && !(next === "delivered" && canCollect) && (
              <Button onClick={() => void actions.advance(row)} data-testid="next-step">
                {t(`statusNext.${next}`)}
                <ArrowRight />
              </Button>
            )}
            {row.status !== "cancelled" && (canCollect || isSuperAdmin) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label={t("detail.actions")} data-testid="order-menu">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  {canCollect && (
                    <DropdownMenuItem onSelect={() => actions.collect(row)}>
                      <Plus />
                      {t("detail.addPayment")}
                    </DropdownMenuItem>
                  )}
                  {back && (
                    <DropdownMenuItem onSelect={() => actions.stepBack(row)}>
                      <ArrowLeft />
                      {t("orders.stepBack")}
                    </DropdownMenuItem>
                  )}
                  {canDiscount && (
                    <DropdownMenuItem onSelect={() => actions.discount(row)}>
                      <BadgePercent />
                      {t("detail.freeDiscount")}
                    </DropdownMenuItem>
                  )}
                  {isSuperAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => actions.cancel(row)}>
                        <Ban />
                        {t("detail.cancelOrder")}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      >
        <div className="pt-2" data-testid="order-status">
          <StatusBadge status={row.status} />
        </div>
      </PageHeader>

      {row.status === "cancelled" && (
        <p className="mb-6 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t("detail.cancelledOn", { date: order.cancelledAt ? f.dateTime(order.cancelledAt) : "—" })}
          {order.cancelReason && ` · ${localized(order.cancelReason, locale)}`}
          {order.cancelNote && ` · ${order.cancelNote}`}
        </p>
      )}

      <Card className="mb-6">
        <CardContent>
          <StatusTimeline status={row.status} events={data.events} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("detail.prescription")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <PrescriptionTable od={order.od} og={order.og} />
              <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                {visible("ep_re") && order.epRe !== null && <Info label={t("detail.epRe")}>{order.epRe} mm</Info>}
                {visible("ep_le") && order.epLe !== null && <Info label={t("detail.epLe")}>{order.epLe} mm</Info>}
                {visible("fitting_height") && order.fittingHeight !== null && <Info label={t("detail.fittingHeight")}>{order.fittingHeight} mm</Info>}
                {order.visionType && <Info label={t("detail.visionType")}>{localized(order.visionType, locale)}</Info>}
                {order.doctorName && <Info label={t("detail.doctor")}>{order.doctorName}</Info>}
                {order.prescriptionDate && <Info label={t("detail.prescriptionDate")}>{f.date(order.prescriptionDate)}</Info>}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("detail.products")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center gap-3 rounded-xl border p-3">
                <span className="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
                  <Glasses className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{t("detail.frame")}</p>
                  <p className="font-medium">{row.ownFrame ? t("detail.clientFrame") : (frame?.name ?? "—")}</p>
                </div>
                {frame && <span className="num font-medium">{f.money(frame.unitPrice)}</span>}
              </div>
              {others.length > 0 && (
                <ul className="divide-y rounded-xl border">
                  {others.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <span>
                        {i.name} <span className="text-muted-foreground">{t("detail.qty", { qty: i.qty })}</span>
                      </span>
                      <span className="num font-medium">{f.money(i.unitPrice * i.qty)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <dl className="grid gap-3 sm:grid-cols-2">
                <Info label={t("detail.lensType")}>{order.lensType ? localized(order.lensType, locale) : "—"}</Info>
                <Info label={t("detail.treatments")}>{data.treatments.length ? data.treatments.map((tr) => localized(tr, locale)).join(" · ") : "—"}</Info>
                {order.lensDetails && (
                  <div className="sm:col-span-2">
                    <Info label={t("wizard.lensDescription")}>{order.lensDetails}</Info>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("detail.payments")}</CardTitle>
              {canCollect && (
                <CardAction>
                  <Button variant="outline" size="sm" onClick={() => actions.collect(row)}>
                    <Plus />
                    {t("detail.addPayment")}
                  </Button>
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {data.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("detail.noPayments")}</p>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {data.payments.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                        <ReceiptText className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {t(`detail.paymentKinds.${p.kind}`)} · {p.method ? localized(p.method, locale) : "—"}
                        </p>
                        <p className="num text-xs text-muted-foreground">
                          {f.dateTime(p.at)}
                          {p.by && ` · ${p.by}`}
                        </p>
                      </div>
                      <span className={cn("num font-semibold", p.amount < 0 && "text-destructive")}>{f.money(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <dl className="grid grid-cols-3 gap-3 rounded-xl bg-muted/50 p-4">
                <div>
                  <dt className="text-xs text-muted-foreground">{t("money.total")}</dt>
                  <dd className="num mt-1 font-semibold">{f.money(row.total)}</dd>
                  {order.discountAmount > 0 && (
                    <dd className="num text-xs text-primary">
                      {t(order.discountSource === "admin_free" ? "detail.discountFree" : "detail.discountClient", { amount: f.money(order.discountAmount) })}
                    </dd>
                  )}
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("money.paidAmount")}</dt>
                  <dd className="num mt-1 font-semibold">{f.money(row.paid)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("money.reste")}</dt>
                  <dd
                    className={cn("num mt-1 text-lg font-bold", row.status === "cancelled" ? "text-muted-foreground" : row.balance > 0 ? "text-attention-text" : "text-success-text")}
                    data-testid="detail-balance"
                  >
                    {f.money(row.balance)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {custom.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("detail.customFields")}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  {custom.map((fd) => (
                    <Info key={fd.key} label={locale === "en" ? fd.labelEn : fd.labelFr}>
                      {customLabel(fd)}
                    </Info>
                  ))}
                </dl>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t("detail.history")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                {history.map((h, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/60" aria-hidden="true" />
                    <span>
                      <span className="font-medium">{h.text}</span>
                      <span className="num block text-xs text-muted-foreground">
                        {f.dateTime(h.at)}
                        {h.by && ` · ${h.by}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="order-first space-y-6 lg:order-none">
          {data.client && (
            <Card>
              <CardHeader>
                <CardTitle>{t("detail.client")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-lg font-semibold">{data.client.full_name}</p>
                  {data.client.notes && <p className="mt-1 text-sm text-muted-foreground">{data.client.notes}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={`tel:${data.client.phone_e164}`}>
                      <Phone />
                      <span className="num">{formatPhone(data.client.phone_e164)}</span>
                    </a>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/clients/${data.client.id}`}>
                      <ExternalLink />
                      {t("detail.openClient")}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          <PhotoCard data={data} />
        </div>
      </div>
    </>
  );
}

export function OrderDetail({ data, isSuperAdmin, methods, reasons }: { data: OrderDetailData; isSuperAdmin: boolean; methods: Labeled[]; reasons: Labeled[] }) {
  return (
    <OrderActionsProvider isSuperAdmin={isSuperAdmin} methods={methods} reasons={reasons}>
      <Detail data={data} isSuperAdmin={isSuperAdmin} />
    </OrderActionsProvider>
  );
}
