"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useShell } from "@/components/layout/shell-context";
import { WhatsAppIcon } from "@/components/shared/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { adminMessageVars, clientMessageVars, type AdminNotifyOrder } from "@/features/orders/notify";
import { useFormat } from "@/lib/use-format";
import { fillTemplate, TEMPLATE_KEYS, TEMPLATE_VARIABLES, type TemplateKey, type WhatsappTemplates } from "@/lib/whatsapp";
import { useSettingsAction } from "../../use-settings-action";
import { setWhatsappTemplates } from "../actions";

const MAX = 1000;

/** Settings › Messages WhatsApp (SPEC §8): the super admin rewrites the texts, with a live preview. */
export function WhatsappTab({ saved }: { saved: WhatsappTemplates }) {
  const t = useTranslations("settings.whatsapp");
  const tc = useTranslations("common");
  const tm = useTranslations("whatsappMessages");
  const f = useFormat();
  const { user } = useShell();
  const run = useSettingsAction();
  const refs = useRef<Partial<Record<TemplateKey, HTMLTextAreaElement | null>>>({});

  const defaults = Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, tm.raw(k) as string])) as Record<TemplateKey, string>;
  const current = (k: TemplateKey) => saved[k] ?? defaults[k];
  const [values, setValues] = useState(() => Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, current(k)])) as Record<TemplateKey, string>);
  const [pending, setPending] = useState(false);
  const dirty = TEMPLATE_KEYS.some((k) => values[k] !== current(k));
  const tooLong = TEMPLATE_KEYS.some((k) => values[k].trim().length > MAX);
  const isDefault = (k: TemplateKey) => !values[k].trim() || values[k].trim() === defaults[k].trim();

  // Example order for the preview: 1 200 DH, 360 DH deposit, 840 DH collected at the delivery.
  const sample: AdminNotifyOrder = { displayNumber: "CNT-00832", clientName: t("sampleClient"), storeName: t("sampleStore"), total: 1200, paid: 360, balance: 840, discountAmount: 0 };
  const previewVars = (k: TemplateKey) =>
    k === "client_ready"
      ? clientMessageVars(sample, f.money)
      : adminMessageVars(k === "delivered" ? { ...sample, paid: 1200, balance: 0, paidToday: 840 } : sample, user.fullName, f.money);

  const set = (k: TemplateKey, text: string) => setValues((v) => ({ ...v, [k]: text }));

  // Puts {variable} where the cursor is (or at the end) and keeps the cursor after it.
  const insert = (k: TemplateKey, variable: string) => {
    const el = refs.current[k];
    const token = `{${variable}}`;
    const text = values[k];
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? start;
    set(k, text.slice(0, start) + token + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    setPending(true);
    // A text left as the default is not stored, so it follows future default changes.
    const payload = Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, isDefault(k) ? "" : values[k]]));
    const done = await run(() => setWhatsappTemplates(payload), t("saved"));
    if (done) setValues(Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, isDefault(k) ? defaults[k] : values[k].trim()])) as Record<TemplateKey, string>);
    setPending(false);
  };

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <WhatsAppIcon className="size-5 text-whatsapp-text" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ul className="divide-y rounded-2xl border">
          {TEMPLATE_KEYS.map((k) => {
            const id = `wa-template-${k}`;
            const long = values[k].trim().length > MAX;
            return (
              <li key={k} className="space-y-3 p-4 sm:p-5" data-testid={`wa-template-${k}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <Label htmlFor={id} className="text-base font-semibold">
                      {t(`items.${k}.title`)}
                    </Label>
                    <p className="text-sm text-muted-foreground">{t(`items.${k}.hint`)}</p>
                  </div>
                  <Badge variant={isDefault(k) ? "outline" : "secondary"}>{isDefault(k) ? t("default") : t("custom")}</Badge>
                </div>
                <Textarea
                  id={id}
                  ref={(el) => {
                    refs.current[k] = el;
                  }}
                  rows={3}
                  value={values[k]}
                  onChange={(e) => set(k, e.target.value)}
                  aria-invalid={long}
                  aria-describedby={long ? `${id}-error` : undefined}
                  data-testid={`wa-text-${k}`}
                />
                {long && (
                  <p id={`${id}-error`} className="text-sm text-destructive">
                    {t("tooLong")}
                  </p>
                )}
                <div role="group" aria-label={t("insert")} className="flex flex-wrap gap-1.5">
                  {TEMPLATE_VARIABLES[k].map((v) => (
                    <Button key={v} type="button" variant="outline" size="xs" onClick={() => insert(k, v)} aria-label={t("insertOne", { label: t(`vars.${v}`) })}>
                      {t(`vars.${v}`)}
                    </Button>
                  ))}
                </div>
                <div className="rounded-2xl bg-whatsapp/10 px-4 py-3 text-sm">
                  <p className="mb-1 text-xs font-medium text-whatsapp-text">{t("preview")}</p>
                  <p className="break-words whitespace-pre-wrap" data-testid={`wa-preview-${k}`}>
                    {fillTemplate(values[k].trim() ? values[k] : defaults[k], previewVars(k))}
                  </p>
                </div>
                {!isDefault(k) && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => set(k, defaults[k])} data-testid={`wa-reset-${k}`}>
                    <RotateCcw />
                    {t("reset")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-muted-foreground">{t("previewHint")}</p>
        <div className="flex justify-end">
          <Button disabled={!dirty || tooLong || pending} onClick={save} data-testid="wa-save">
            {pending && <Loader2 className="animate-spin" />}
            {tc("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
