"use client";

import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ResponsiveDialog } from "@/components/shared/dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSettingsAction } from "@/features/settings/use-settings-action";
import { localized } from "@/lib/localized";
import { cn } from "@/lib/utils";
import { adjustStock, recordDamage } from "../actions";
import type { Labeled } from "../queries";
import type { DrawerTarget } from "./movements-drawer";
import { signed, Stepper } from "./stock-bits";

/** Dialog target: one category at one location, with its current level. */
export type RowTarget = DrawerTarget;

function SubmitButton({ pending, disabled, onClick, children }: { pending: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button onClick={onClick} disabled={pending || disabled}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}

/** Inventory count: the level becomes the counted quantity (one adjustment movement of the difference). */
export function AdjustDialog({ target, reasons, onClose }: { target: RowTarget | null; reasons: Labeled[]; onClose: () => void }) {
  const t = useTranslations("stock.adjust");
  const tc = useTranslations("common");
  const locale = useLocale();
  const run = useSettingsAction();
  const [counted, setCounted] = useState(0);
  const [reasonId, setReasonId] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);

  // Start from the current level each time the dialog opens for a row.
  const key = target ? `${target.storeId}:${target.categoryId}` : null;
  if (key !== openFor) {
    setOpenFor(key);
    setCounted(target?.quantity ?? 0);
    setReasonId(reasons[0]?.id ?? "");
    setNote("");
  }

  const current = target?.quantity ?? 0;
  const diff = counted - current;

  const submit = async () => {
    if (!target || diff === 0 || !reasonId) return;
    setPending(true);
    const done = await run(
      () => adjustStock({ storeId: target.storeId, categoryId: target.categoryId, counted, reasonId, note: note.trim() || undefined }),
      t("done", { category: target.categoryName, qty: counted }),
    );
    setPending(false);
    if (done) onClose();
  };

  return (
    <ResponsiveDialog
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title={t("title")}
      description={target ? `${target.categoryName} · ${target.locationName}` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <SubmitButton pending={pending} disabled={diff === 0 || !reasonId} onClick={() => void submit()}>
            {t("confirm")}
          </SubmitButton>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 items-center gap-3 rounded-xl bg-muted/60 p-4 text-center">
          <div>
            <p className="text-xs text-muted-foreground">{t("current")}</p>
            <p className="num text-2xl font-bold">{current}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("difference")}</p>
            <p className={cn("num text-lg font-semibold", diff > 0 ? "text-success-text" : diff < 0 ? "text-destructive" : "text-muted-foreground")}>{signed(diff)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("counted")}</p>
            <p className="num text-2xl font-bold text-primary">{counted}</p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="adjust-counted">{t("counted")}</Label>
          <Stepper id="adjust-counted" value={counted} onChange={setCounted} />
          {diff === 0 && <p className="text-xs text-muted-foreground">{t("noDifference")}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="adjust-reason">{t("reason")}</Label>
          <Select value={reasonId} onValueChange={setReasonId}>
            <SelectTrigger id="adjust-reason" className="w-full">
              <SelectValue placeholder={t("reasonPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {reasons.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {localized(r, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="adjust-note">
            {t("note")} <span className="font-normal text-muted-foreground">({tc("optional")})</span>
          </Label>
          <Textarea id="adjust-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </ResponsiveDialog>
  );
}

/** Broken / lost items leave the stock; the reason is required and no charge is created. */
export function DamageDialog({ target, onClose }: { target: RowTarget | null; onClose: () => void }) {
  const t = useTranslations("stock.damage");
  const tc = useTranslations("common");
  const run = useSettingsAction();
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);

  const key = target ? `${target.storeId}:${target.categoryId}` : null;
  if (key !== openFor) {
    setOpenFor(key);
    setQty(1);
    setReason("");
    setTouched(false);
  }

  const available = target?.quantity ?? 0;
  const errors = { qty: qty > available || qty < 1, reason: !reason.trim() };

  const submit = async () => {
    setTouched(true);
    if (!target || errors.qty || errors.reason) return;
    setPending(true);
    const done = await run(
      () => recordDamage({ storeId: target.storeId, categoryId: target.categoryId, qty, reason: reason.trim() }),
      t("done", { category: target.categoryName, qty }),
    );
    setPending(false);
    if (done) onClose();
  };

  return (
    <ResponsiveDialog
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title={t("title")}
      description={target ? `${target.categoryName} · ${target.locationName}` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <SubmitButton pending={pending} disabled={available === 0} onClick={() => void submit()}>
            {t("confirm")}
          </SubmitButton>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="damage-qty">{t("qty")}</Label>
          <Stepper id="damage-qty" value={qty} onChange={setQty} min={1} max={Math.max(1, available)} invalid={touched && errors.qty} />
          <p className={cn("text-xs", errors.qty ? "text-destructive" : "text-muted-foreground")}>{t("tooMany", { count: available })}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="damage-reason">{t("reason")}</Label>
          <Input
            id="damage-reason"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("reasonPlaceholder")}
            aria-invalid={touched && errors.reason}
            aria-describedby="damage-reason-error"
          />
          {touched && errors.reason && (
            <p id="damage-reason-error" className="text-sm text-destructive">
              {t("reasonRequired")}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
