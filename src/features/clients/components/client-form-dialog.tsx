"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { WhatsAppIcon } from "@/components/shared/badges";
import { ResponsiveDialog } from "@/components/shared/dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { formatPhone, formatPhoneTyping, normalizePhone } from "@/lib/phone";
import { createClientRecord, findSimilarClients, updateClientRecord } from "../actions";

export interface EditableClient {
  id: string;
  full_name: string;
  phone_e164: string;
  has_whatsapp: boolean;
  notes: string | null;
}

type Similar = { id: string; full_name: string; phone_e164: string };

/** Create or edit a client (contact fields). New clients get a "similar name" warning. */
export function ClientFormDialog({
  open,
  onOpenChange,
  client,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: EditableClient;
  onSaved?: (id: string) => void;
}) {
  const t = useTranslations();
  const schema = useMemo(
    () =>
      z.object({
        fullName: z.string().trim().min(2, { message: t("clients.nameRequired") }),
        phone: z.string().refine((v) => normalizePhone(v) !== null, { message: t("clients.phoneInvalid") }),
        hasWhatsapp: z.boolean(),
        notes: z.string().max(500),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      fullName: client?.full_name ?? "",
      phone: client ? formatPhone(client.phone_e164) : "",
      hasWhatsapp: client?.has_whatsapp ?? true,
      notes: client?.notes ?? "",
    },
  });
  const { errors, isSubmitting } = form.formState;
  const whatsapp = useWatch({ control: form.control, name: "hasWhatsapp" });
  const phone = useWatch({ control: form.control, name: "phone" });
  const fullName = useWatch({ control: form.control, name: "fullName" });
  const [similar, setSimilar] = useState<Similar[]>([]);

  // Similar names (new clients only), checked a moment after typing stops.
  useEffect(() => {
    if (client || !open) return;
    const name = fullName.trim();
    const timer = setTimeout(async () => setSimilar(name.length >= 3 ? await findSimilarClients(name) : []), 400);
    return () => clearTimeout(timer);
  }, [fullName, client, open]);

  const submit = form.handleSubmit(async (v) => {
    const result = client ? await updateClientRecord({ id: client.id, ...v }) : await createClientRecord(v);
    if (!result.ok) {
      if (result.error === "phoneExists" || result.error === "invalidInput") form.setError("phone", { message: t(`errors.${result.error}`) });
      else toast.error(t(`errors.${result.error}`));
      return;
    }
    toast.success(client ? t("clients.saved") : t("clients.created", { name: v.fullName.trim() }));
    onOpenChange(false);
    onSaved?.(client ? client.id : (result.data as { id: string }).id);
  });

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={client ? t("clients.editTitle") : t("clients.createTitle")}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            {t("common.save")}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="client-name">{t("wizard.fullName")}</Label>
          <Input id="client-name" autoComplete="off" maxLength={120} placeholder={t("wizard.fullNamePlaceholder")} aria-invalid={!!errors.fullName} {...form.register("fullName")} />
          {errors.fullName && <p className="text-sm text-destructive">{errors.fullName.message}</p>}
          {similar.length > 0 && (
            <div className="space-y-1 rounded-xl bg-attention/10 p-3 text-sm text-attention-text" role="status">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="size-4" aria-hidden="true" />
                {t("clients.similarTitle")}
              </p>
              <ul className="space-y-0.5">
                {similar.map((s) => (
                  <li key={s.id}>
                    <Link href={`/clients/${s.id}`} className="underline underline-offset-2" onClick={() => onOpenChange(false)}>
                      {s.full_name}
                    </Link>{" "}
                    <span className="num">· {formatPhone(s.phone_e164)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="client-phone">{t("wizard.phone")}</Label>
          <Input
            id="client-phone"
            type="tel"
            inputMode="tel"
            className="num"
            placeholder={t("wizard.phonePlaceholder")}
            aria-invalid={!!errors.phone}
            value={phone}
            onChange={(e) => form.setValue("phone", formatPhoneTyping(e.target.value), { shouldValidate: form.formState.isSubmitted })}
          />
          {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
        </div>
        <label htmlFor="client-whatsapp" className="flex cursor-pointer items-center gap-3 rounded-xl border p-3">
          <WhatsAppIcon className="size-5 text-whatsapp" />
          <span className="flex-1">
            <span className="block text-sm font-medium">{t("wizard.whatsapp")}</span>
            <span className="block text-xs text-muted-foreground">{t("wizard.whatsappHint")}</span>
          </span>
          <Switch id="client-whatsapp" checked={whatsapp} onCheckedChange={(v) => form.setValue("hasWhatsapp", v)} />
        </label>
        <div className="space-y-2">
          <Label htmlFor="client-notes">{t("clients.notes")}</Label>
          <Textarea id="client-notes" rows={2} maxLength={500} placeholder={t("clients.notesPlaceholder")} {...form.register("notes")} />
        </div>
      </form>
    </ResponsiveDialog>
  );
}
