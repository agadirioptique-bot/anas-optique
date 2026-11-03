"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ResponsiveDialog } from "@/components/shared/dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSettingsAction } from "@/features/settings/use-settings-action";
import { saveSupplier } from "../actions";

export interface SupplierDraft {
  id?: string;
  name: string;
  phone: string | null;
  note: string | null;
}

/** Create or edit a supplier. `onSaved` gets the id (the new purchase form selects it). */
export function SupplierDialog({
  open,
  supplier,
  onClose,
  onSaved,
}: {
  open: boolean;
  supplier: SupplierDraft | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const t = useTranslations("purchases.suppliers.form");
  const tc = useTranslations("common");
  const run = useSettingsAction();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(supplier?.name ?? "");
      setPhone(supplier?.phone ?? "");
      setNote(supplier?.note ?? "");
      setTouched(false);
    }
  }

  const submit = async () => {
    setTouched(true);
    if (!name.trim()) return;
    setPending(true);
    let savedId: string | null = null;
    const done = await run(async () => {
      const result = await saveSupplier({ id: supplier?.id, name: name.trim(), phone: phone.trim() || undefined, note: note.trim() || undefined });
      if (result.ok) savedId = result.data.id;
      return result;
    }, supplier?.id ? t("saved") : t("created"));
    setPending(false);
    if (done && savedId) {
      onSaved?.(savedId);
      onClose();
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={supplier?.id ? t("editTitle") : t("createTitle")}
      size="sm"
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
          <Label htmlFor="supplier-name">{t("name")}</Label>
          <Input
            id="supplier-name"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={touched && !name.trim()}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
          />
          {touched && !name.trim() && <p className="text-sm text-destructive">{t("nameRequired")}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="supplier-phone">
            {t("phone")} <span className="font-normal text-muted-foreground">({tc("optional")})</span>
          </Label>
          <Input id="supplier-phone" type="tel" inputMode="tel" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="supplier-note">
            {t("note")} <span className="font-normal text-muted-foreground">({tc("optional")})</span>
          </Label>
          <Textarea id="supplier-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </ResponsiveDialog>
  );
}
