"use client";

import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ResponsiveDialog } from "@/components/shared/dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { StoreSummary } from "@/features/auth/types";
import type { ErrorCode } from "@/lib/errors";
import { ROLES, type AppRole } from "@/lib/permissions";
import { inviteUser } from "../actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteDialog({ stores, onClose, onInvited }: { stores: StoreSummary[]; onClose: () => void; onInvited: () => void }) {
  const t = useTranslations("settings.users");
  const tc = useTranslations("common");
  const ta = useTranslations("auth");
  const te = useTranslations("errors");
  const tr = useTranslations("roles");
  const shops = stores.filter((s) => s.kind === "store");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("secretary");
  const [storeId, setStoreId] = useState<string>(shops[0]?.id ?? "");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const nameOk = fullName.trim().length >= 2;
  const emailOk = EMAIL_RE.test(email.trim());
  const storeOk = role === "super_admin" || !!storeId;

  const send = async () => {
    setTouched(true);
    setError(null);
    if (!nameOk || !emailOk || !storeOk) return;
    setPending(true);
    const result = await inviteUser({ fullName, email, role, storeId: role === "super_admin" ? null : storeId });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(email.trim());
    onInvited();
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={sent ? t("sent") : t("inviteTitle")}
      footer={
        sent ? (
          <Button onClick={onClose}>{t("done")}</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button onClick={send} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Mail />}
              {t("send")}
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center motion-safe:animate-pop-in" role="status">
          <CheckCircle2 className="size-14 text-success-text" aria-hidden="true" />
          <p className="max-w-sm text-sm text-muted-foreground">{t("sentBody", { email: sent })}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inv-name">{t("fullName")}</Label>
            <Input id="inv-name" value={fullName} onChange={(e) => setFullName(e.target.value)} aria-invalid={touched && !nameOk} placeholder={t("fullNamePlaceholder")} autoComplete="off" />
            {touched && !nameOk && <p className="text-sm text-destructive">{t("nameRequired")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-email">{t("email")}</Label>
            <Input id="inv-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={touched && !emailOk} placeholder={ta("emailPlaceholder")} autoComplete="off" />
            {touched && !emailOk && <p className="text-sm text-destructive">{ta("emailInvalid")}</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inv-role">{t("role")}</Label>
              <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                <SelectTrigger id="inv-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {tr(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-loc">{t("location")}</Label>
              {role === "super_admin" ? (
                <Input id="inv-loc" value={t("noLocation")} disabled />
              ) : (
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger id="inv-loc" className="w-full" aria-invalid={touched && !storeOk}>
                    <SelectValue placeholder={t("chooseStore")} />
                  </SelectTrigger>
                  <SelectContent>
                    {shops.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {touched && !storeOk && <p className="text-sm text-destructive">{t("storeRequired")}</p>}
            </div>
          </div>
          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {te(error)}
            </p>
          )}
        </div>
      )}
    </ResponsiveDialog>
  );
}
