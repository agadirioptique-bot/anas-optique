"use client";

import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ResponsiveDialog } from "@/components/shared/dialogs";
import { MoneyInput } from "@/components/shared/money-input";
import { Stepper } from "@/components/shared/stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useSettingsAction } from "@/features/settings/use-settings-action";
import { localized } from "@/lib/localized";
import { saveRecurring } from "../actions";
import type { ChargeReference, RecurringRow } from "../queries";

/** New / edit recurring charge (a pending charge is created on that day each month). */
export function RecurringDialog({
  open,
  recurring,
  reference,
  onClose,
}: {
  open: boolean;
  recurring: RecurringRow | null;
  reference: ChargeReference;
  onClose: () => void;
}) {
  const t = useTranslations("charges.recurring.form");
  const tc = useTranslations("common");
  const tf = useTranslations("charges.form");
  const tr = useTranslations("charges.recurring");
  const locale = useLocale();
  const run = useSettingsAction();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState<number | undefined>();
  const [day, setDay] = useState(1);
  const [categoryId, setCategoryId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [active, setActive] = useState(true);
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setLabel(recurring?.label ?? "");
      setAmount(recurring?.amount);
      setDay(recurring?.dayOfMonth ?? 1);
      setCategoryId(recurring?.categoryId ?? "");
      setLocationId(recurring?.locationId ?? reference.locations.find((l) => l.isGeneral)?.id ?? "");
      setActive(recurring?.isActive ?? true);
      setTouched(false);
    }
  }

  const categories = [...reference.categories];
  if (recurring && !categories.some((c) => c.id === recurring.categoryId) && reference.labels[recurring.categoryId]) categories.push(reference.labels[recurring.categoryId]);
  const locations: { id: string; label_fr: string; label_en: string }[] = [...reference.locations];
  if (recurring && !locations.some((l) => l.id === recurring.locationId) && reference.labels[recurring.locationId]) locations.push(reference.labels[recurring.locationId]);

  const errors = { label: !label.trim(), amount: !amount || amount <= 0, category: !categoryId, location: !locationId };

  const submit = async () => {
    setTouched(true);
    if (Object.values(errors).some(Boolean)) return;
    setPending(true);
    const done = await run(
      () => saveRecurring({ id: recurring?.id, label: label.trim(), amount, categoryId, locationId, dayOfMonth: day, isActive: active }),
      recurring ? t("saved") : t("created"),
    );
    setPending(false);
    if (done) onClose();
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={recurring ? t("editTitle") : t("createTitle")}
      description={tr("hint")}
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
        <div className="space-y-2">
          <Label htmlFor="recurring-label">{t("label")}</Label>
          <Input id="recurring-label" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} placeholder={t("labelPlaceholder")} aria-invalid={touched && errors.label} />
          {touched && errors.label && <p className="text-sm text-destructive">{t("labelRequired")}</p>}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="recurring-amount">{t("amount")}</Label>
            <MoneyInput id="recurring-amount" value={amount} onChange={setAmount} invalid={touched && errors.amount} />
            {touched && errors.amount && <p className="text-sm text-destructive">{tf("errors.amount")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="recurring-day">{t("day")}</Label>
            <Stepper id="recurring-day" value={day} onChange={setDay} min={1} max={28} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recurring-category">{t("category")}</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="recurring-category" className="w-full" aria-invalid={touched && errors.category}>
                <SelectValue placeholder={tf("chooseCategory")} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {localized(c, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="recurring-location">{t("location")}</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger id="recurring-location" className="w-full" aria-invalid={touched && errors.location}>
                <SelectValue placeholder={tf("chooseLocation")} />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {localized(l, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
          <span className="text-sm font-medium">{t("active")}</span>
          <Switch checked={active} onCheckedChange={setActive} />
        </label>
      </div>
    </ResponsiveDialog>
  );
}
