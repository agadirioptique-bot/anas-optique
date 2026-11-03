"use client";

import { Glasses, MapPin, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { SegmentBadge, WhatsAppIcon } from "@/components/shared/badges";
import { prescriptionLine } from "@/features/orders/lib/prescription";
import { localized } from "@/lib/localized";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";
import { discountAmount, displayNumber, type OrderFormValues } from "../form";
import { useNewOrder } from "./context";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium">{children}</span>
    </div>
  );
}

/** Sticky recap on the right (bottom sheet on phones) — demo layout. */
export function OrderSummary({ className }: { className?: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const f = useFormat();
  const { data, client } = useNewOrder();
  const form = useFormContext<OrderFormValues>();
  const v = useWatch({ control: form.control }) as OrderFormValues;
  const existing = v.clientMode === "existing" ? client : null;
  const name = existing?.full_name ?? (v.clientMode === "new" ? v.newClient?.fullName : "");
  const phone = existing?.phone_e164 ?? (v.clientMode === "new" ? normalizePhone(v.newClient?.phone) : null);
  const whatsapp = existing?.has_whatsapp ?? (v.clientMode === "new" ? v.newClient?.hasWhatsapp : false);
  const store = data.stores.find((s) => s.id === v.storeId);
  const discount = discountAmount(v.total, v.pendingDiscount, v.clientMode === "existing" && !!v.applyDiscount);
  const net = Math.max(0, (v.total ?? 0) - discount);
  const reste = Math.max(0, net - (v.deposit ?? 0));
  const hasRx = [v.od, v.og].some((e) => e && Object.values(e).some((x) => x !== null));
  const category = (id: string) => data.categories.find((c) => c.id === id);
  const items = Object.entries(v.items ?? {}).filter(([, q]) => q > 0);
  const lensType = data.lensTypes.find((l) => l.id === v.lensTypeId);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
          <UserRound className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          {name ? (
            <>
              <p className="truncate font-semibold">{name}</p>
              <p className="num flex items-center gap-1 text-sm text-muted-foreground">
                {whatsapp && <WhatsAppIcon className="size-3.5 text-whatsapp" />}
                {phone ? formatPhone(phone) : "—"}
              </p>
              {existing && <SegmentBadge segment={existing.is_loyal ? "loyal" : existing.orders <= 1 ? "new" : "regular"} className="mt-1" />}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("wizard.noClientYet")}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <MapPin className="size-4" aria-hidden="true" />
          {store?.name}
        </span>
        <span className="num font-semibold">{store ? displayNumber(store.prefix, v.booklet ?? "", v.slipNumber, data.padding) : ""}</span>
      </div>

      {hasRx && (
        <div className="space-y-1 rounded-xl bg-muted/60 p-3 text-sm">
          <p className="num">
            <span className="mr-2 font-bold">{t("rx.od")}</span>
            {prescriptionLine(v.od)}
          </p>
          <p className="num">
            <span className="mr-2 font-bold">{t("rx.og")}</span>
            {prescriptionLine(v.og)}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Row label={t("wizard.frame")}>
          {v.ownFrame ? t("detail.clientFrame") : v.frameCategoryId ? category(v.frameCategoryId)?.name : <span className="text-muted-foreground">{t("wizard.noFrame")}</span>}
        </Row>
        {items.map(([id, qty]) => (
          <Row key={id} label={category(id)?.name ?? ""}>
            <span className="num">× {qty}</span>
          </Row>
        ))}
        <Row label={t("wizard.lenses")}>{lensType ? localized(lensType, locale) : <span className="text-muted-foreground">{t("wizard.noLens")}</span>}</Row>
        {v.treatmentIds?.length > 0 && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Glasses className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {v.treatmentIds.map((id) => data.treatments.find((tr) => tr.id === id)).filter(Boolean).map((tr) => localized(tr!, locale)).join(" · ")}
          </p>
        )}
      </div>

      <div className="space-y-2 border-t pt-4">
        <Row label={t("money.total")}>
          <span className="num">{v.total !== undefined ? f.money(v.total) : "—"}</span>
        </Row>
        {discount > 0 && (
          <Row label={t("wizard.discount")}>
            <span className="num text-primary">−{f.money(discount)}</span>
          </Row>
        )}
        <Row label={t("wizard.deposit")}>
          <span className="num">{v.deposit !== undefined ? f.money(v.deposit) : "—"}</span>
        </Row>
        <div className="flex items-baseline justify-between gap-3 pt-1">
          <span className="text-sm font-medium">{t("wizard.reste")}</span>
          <span className={cn("num text-2xl font-bold", reste > 0 ? "text-attention-text" : "text-success-text")}>{f.money(reste)}</span>
        </div>
      </div>
    </div>
  );
}
