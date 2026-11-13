"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { WhatsAppIcon } from "@/components/shared/badges";
import { ResponsiveDialog } from "@/components/shared/dialogs";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/lib/phone";
import { useFormat } from "@/lib/use-format";
import { whatsappLink } from "@/lib/whatsapp";
import { loadAdminContacts, type AdminContact } from "../notify-actions";
import type { AdminNotifyOrder, AdminNotifyStep } from "../notify";

/**
 * Secretary → super admin on WhatsApp: one button per admin opens WhatsApp with the message ready
 * (the secretary taps Send). Shown right after the step; "Plus tard" skips it.
 */
export function NotifyAdminDialog({ open, onOpenChange, step, order }: { open: boolean; onOpenChange: (open: boolean) => void; step: AdminNotifyStep; order: AdminNotifyOrder }) {
  const t = useTranslations("notifyAdmin");
  const te = useTranslations("errors");
  const f = useFormat();
  const [contacts, setContacts] = useState<AdminContact[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void loadAdminContacts().then((r) => {
      if (!live) return;
      if (r.ok) setContacts(r.data);
      else setError(te(r.error));
    });
    return () => {
      live = false;
    };
  }, [open, te]);

  const message = (admin: AdminContact) =>
    t(`messages.${step}`, {
      admin: admin.name.trim().split(/\s+/)[0] ?? admin.name,
      number: order.displayNumber,
      client: order.clientName,
      store: order.storeName,
      total: f.money(order.total),
      paid: f.money(order.paid),
      balance: f.money(order.balance),
      hasBalance: order.balance > 0 ? "yes" : "no",
    });

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={t(`title.${step}`)}
      description={t("description", { number: order.displayNumber, client: order.clientName })}
      footer={
        <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="notify-admin-later">
          {contacts?.length === 0 ? t("close") : t("later")}
        </Button>
      }
    >
      <div className="space-y-3" data-testid="notify-admin">
        {error ? (
          <p className="text-sm text-destructive-text">{error}</p>
        ) : contacts === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t("loading")}
          </p>
        ) : contacts.length === 0 ? (
          <p className="rounded-xl bg-attention/10 px-4 py-3 text-sm text-attention-text">{t("noAdmins")}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t("hint")}</p>
            <ul className="space-y-2">
              {contacts.map((admin) => (
                <li key={admin.id}>
                  <Button asChild variant="whatsapp" size="lg" className="h-auto w-full justify-start gap-3 py-3">
                    <a
                      href={whatsappLink(admin.whatsapp, message(admin))}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onOpenChange(false)}
                      data-testid="notify-admin-link"
                    >
                      <WhatsAppIcon className="size-5" />
                      <span className="min-w-0 text-left">
                        <span className="block truncate">{t("sendTo", { name: admin.name })}</span>
                        <span className="num block text-xs font-normal opacity-90">{formatPhone(admin.whatsapp)}</span>
                      </span>
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}

/** "Prévenir l'admin" button that opens the dialog (order page, success screen). */
export function NotifyAdminButton({ step, order, className }: { step: AdminNotifyStep; order: AdminNotifyOrder; className?: string }) {
  const t = useTranslations("notifyAdmin");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className={className} onClick={() => setOpen(true)} data-testid="notify-admin-open">
        <WhatsAppIcon className="text-whatsapp-text" />
        {t("button")}
      </Button>
      <NotifyAdminDialog open={open} onOpenChange={setOpen} step={step} order={order} />
    </>
  );
}
