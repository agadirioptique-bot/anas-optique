"use client";

import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Money } from "@/components/shared/badges";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { ResponsiveDialog } from "@/components/shared/dialogs";
import { MoneyInput } from "@/components/shared/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSettingsAction } from "@/features/settings/use-settings-action";
import { localized } from "@/lib/localized";
import { useFormat } from "@/lib/use-format";
import { addSupplierPayment } from "../actions";
import { percentOf, todayIso } from "../lib";
import type { Labeled } from "../queries";

export interface PaymentTarget {
  purchaseId: string;
  supplierName: string;
  remaining: number;
}

type Choice = "settle" | "half" | "custom";

/** Supplier payment ≤ remaining (checked again under lock by the database); creates a read-only charge. */
export function PaymentDialog({ target, methods, onClose }: { target: PaymentTarget | null; methods: Labeled[]; onClose: () => void }) {
  const t = useTranslations("purchases.pay");
  const tc = useTranslations("common");
  const locale = useLocale();
  const f = useFormat();
  const run = useSettingsAction();
  const [choice, setChoice] = useState<Choice>("settle");
  const [custom, setCustom] = useState<number | undefined>();
  const [methodId, setMethodId] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);

  const key = target?.purchaseId ?? null;
  if (key !== openFor) {
    setOpenFor(key);
    setChoice("settle");
    setCustom(undefined);
    setMethodId(methods[0]?.id ?? "");
    setPaidAt(todayIso());
    setNote("");
    setTouched(false);
  }

  const remaining = target?.remaining ?? 0;
  const amount = choice === "settle" ? remaining : choice === "half" ? percentOf(remaining, 50) : (custom ?? 0);
  const today = todayIso();
  const errors = { amount: amount <= 0 || amount > remaining, method: !methodId, paidAt: !paidAt || paidAt > today };

  const submit = async () => {
    setTouched(true);
    if (!target || errors.amount || errors.method || errors.paidAt) return;
    setPending(true);
    const done = await run(
      () => addSupplierPayment({ purchaseId: target.purchaseId, amount, paidAt, methodId, note: note.trim() || undefined }),
      t("done", { amount: f.money(amount) }),
    );
    setPending(false);
    if (done) onClose();
  };

  return (
    <ResponsiveDialog
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title={t("title")}
      description={target ? t("description", { supplier: target.supplierName, amount: f.money(remaining) }) : undefined}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {t("confirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <ChoiceChips
          label={t("amount")}
          value={choice}
          onChange={(v) => setChoice((v || "settle") as Choice)}
          options={(["settle", "half", "custom"] as const).map((c) => ({ value: c, label: t(`choices.${c}`) }))}
          itemClassName="h-9 px-3 pointer-coarse:h-10"
        />
        <div className="space-y-2">
          <Label htmlFor="pay-amount">{t("amount")}</Label>
          {choice === "custom" ? (
            <MoneyInput id="pay-amount" value={custom} onChange={setCustom} invalid={touched && errors.amount} size="lg" />
          ) : (
            <p id="pay-amount">
              <Money value={amount} className="text-2xl font-bold text-primary" />
            </p>
          )}
          {touched && errors.amount && <p className="text-sm text-destructive">{t("tooHigh", { amount: f.money(remaining) })}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pay-method">{t("method")}</Label>
            <Select value={methodId} onValueChange={setMethodId}>
              <SelectTrigger id="pay-method" className="w-full" aria-invalid={touched && errors.method}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {methods.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {localized(m, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-date">{t("paidAt")}</Label>
            <Input id="pay-date" type="date" value={paidAt} max={today} onChange={(e) => setPaidAt(e.target.value)} aria-invalid={touched && errors.paidAt} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pay-note">
            {t("note")} <span className="font-normal text-muted-foreground">({tc("optional")})</span>
          </Label>
          <Textarea id="pay-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </div>
    </ResponsiveDialog>
  );
}
