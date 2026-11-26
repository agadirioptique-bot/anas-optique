"use client";

import { Loader2, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ResponsiveDialog } from "@/components/shared/dialogs";
import { MoneyInput } from "@/components/shared/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { todayIso } from "@/features/purchases/lib";
import { useSettingsAction } from "@/features/settings/use-settings-action";
import { localized } from "@/lib/localized";
import { findOrders, saveCharge, type OrderMatch } from "../actions";
import type { ChargeReference, ChargeRow } from "../queries";

/** Optional order link: type a number, pick a match (search_global). */
function OrderLookup({ value, onChange }: { value: { id: string; number: string } | null; onChange: (v: { id: string; number: string } | null) => void }) {
  const t = useTranslations("charges.form");
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<OrderMatch[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (!query) return;
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void findOrders({ q: query }).then((r) => {
        if (!live) return;
        setLoading(false);
        setMatches(r.ok ? r.data : []);
      });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);

  if (value) {
    return (
      <div className="flex h-10 items-center justify-between rounded-lg border bg-muted/40 px-3">
        <span className="num font-medium">{value.number}</span>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(null)} aria-label={t("orderClear")} title={t("orderClear")}>
          <X />
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id="charge-order"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (!e.target.value.trim()) setMatches(null);
          }}
          placeholder={t("orderPlaceholder")}
          className="pl-9"
          autoComplete="off"
        />
        {loading && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />}
      </div>
      {matches && q.trim() && (
        <ul className="divide-y rounded-lg border" role="listbox" aria-label={t("order")}>
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">{t("orderNone")}</li>
          ) : (
            matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => onChange({ id: m.id, number: m.displayNumber })}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="num font-medium">{m.displayNumber}</span>
                  <span className="truncate text-muted-foreground">{m.clientName}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/** New / edit manual charge. The database checks the category and location again. */
export function ChargeDialog({
  open,
  charge,
  reference,
  onClose,
}: {
  open: boolean;
  charge: ChargeRow | null;
  reference: ChargeReference;
  onClose: () => void;
}) {
  const t = useTranslations("charges.form");
  const tc = useTranslations("common");
  const locale = useLocale();
  const run = useSettingsAction();
  const [amount, setAmount] = useState<number | undefined>();
  const [date, setDate] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [reason, setReason] = useState("");
  const [order, setOrder] = useState<{ id: string; number: string } | null>(null);
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAmount(charge?.amount);
      setDate(charge?.chargeDate ?? todayIso());
      setCategoryId(charge?.categoryId ?? "");
      setLocationId(charge?.locationId ?? reference.locations.find((l) => l.isGeneral)?.id ?? "");
      setReason(charge?.reason ?? "");
      setOrder(charge?.orderId ? { id: charge.orderId, number: charge.orderNumber ?? "" } : null);
      setTouched(false);
    }
  }

  // An edited charge may use an archived category/location: keep it selectable.
  const categories = [...reference.categories];
  if (charge && !categories.some((c) => c.id === charge.categoryId)) categories.push(charge.category);
  const locations: { id: string; label_fr: string; label_en: string }[] = [...reference.locations];
  if (charge && !locations.some((l) => l.id === charge.locationId)) locations.push(charge.location);

  const today = todayIso();
  const errors = {
    amount: !amount || amount <= 0,
    date: !date || date > today,
    category: !categoryId,
    location: !locationId,
    reason: !reason.trim(),
  };

  const submit = async () => {
    setTouched(true);
    if (Object.values(errors).some(Boolean)) return;
    setPending(true);
    const done = await run(
      () => saveCharge({ id: charge?.id, amount, chargeDate: date, categoryId, locationId, reason: reason.trim(), orderId: order?.id ?? null }),
      charge ? t("saved") : t("created"),
    );
    setPending(false);
    if (done) onClose();
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={charge ? t("editTitle") : t("createTitle")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="charge-amount">{t("amount")}</Label>
            <MoneyInput id="charge-amount" value={amount} onChange={setAmount} invalid={touched && errors.amount} size="lg" />
            {touched && errors.amount && <p className="text-sm text-destructive">{t("errors.amount")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="charge-date">{t("date")}</Label>
            <Input id="charge-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-invalid={touched && errors.date} />
            {touched && errors.date && <p className="text-sm text-destructive">{t("errors.date")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="charge-category">{t("category")}</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="charge-category" className="w-full" aria-invalid={touched && errors.category}>
                <SelectValue placeholder={t("chooseCategory")} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {localized(c, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {touched && errors.category && <p className="text-sm text-destructive">{t("errors.category")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="charge-location">{t("location")}</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger id="charge-location" className="w-full" aria-invalid={touched && errors.location}>
                <SelectValue placeholder={t("chooseLocation")} />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {localized(l, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {touched && errors.location && <p className="text-sm text-destructive">{t("errors.location")}</p>}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="charge-reason">{t("reason")}</Label>
          <Input
            id="charge-reason"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("reasonPlaceholder")}
            aria-invalid={touched && errors.reason}
          />
          {touched && errors.reason && <p className="text-sm text-destructive">{t("reasonRequired")}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="charge-order">
            {t("order")} <span className="font-normal text-muted-foreground">({tc("optional")})</span>
          </Label>
          <OrderLookup value={order} onChange={setOrder} />
          <p className="text-xs text-muted-foreground">{t("orderHint")}</p>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
