"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { useShell } from "@/components/layout/shell-context";
import { useFormat } from "@/lib/use-format";
import { fillTemplate, resolveTemplate, whatsappLink, type TemplateKey } from "@/lib/whatsapp";
import { clientMessageVars } from "./notify";
import type { OrderRow } from "./queries";

/** The text of a WhatsApp message: what the super admin saved in Settings, else the default (SPEC §8). */
export function useWhatsappTemplate(): (key: TemplateKey) => string {
  const { whatsappTemplates } = useShell();
  const t = useTranslations("whatsappMessages");
  return useCallback((key: TemplateKey) => resolveTemplate(whatsappTemplates[key], t.raw(key) as string), [whatsappTemplates, t]);
}

/** "Your glasses are ready" link to the client, or null when the client has no WhatsApp. */
export function useReadyWhatsAppHref(): (row: OrderRow) => string | null {
  const template = useWhatsappTemplate();
  const f = useFormat();
  return useCallback(
    (row: OrderRow) => {
      if (!row.clientHasWhatsapp || !row.clientPhone) return null;
      return whatsappLink(row.clientPhone, fillTemplate(template("client_ready"), clientMessageVars(row, f.money)));
    },
    [template, f],
  );
}
