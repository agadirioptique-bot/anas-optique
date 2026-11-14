"use client";

import { Loader2, RotateCw, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { WhatsAppIcon } from "@/components/shared/badges";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { StoreSummary } from "@/features/auth/types";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/errors";
import { initials } from "@/lib/format";
import { formatPhone, formatPhoneTyping } from "@/lib/phone";
import { ROLES, type AppRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { resendInvite, setUserWhatsapp, updateUserAccess } from "../actions";
import type { UserRow, UserStatus } from "../queries";
import { InviteDialog } from "./invite-dialog";

const NO_STORE = "none";

function StatusPill({ status }: { status: UserStatus }) {
  const t = useTranslations("settings.users");
  const tone = {
    disabled: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
    invited: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    active: "bg-success/10 text-success-text",
  }[status];
  return <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap", tone)}>{t(status)}</span>;
}

/** A super admin's WhatsApp number: secretaries notify him on it. Saved when the field is left. */
function WhatsappField({ user }: { user: UserRow }) {
  const t = useTranslations("settings.users");
  const te = useTranslations("errors");
  const router = useRouter();
  const [value, setValue] = useState(formatPhone(user.whatsapp));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = `whatsapp-${user.id}`;

  const save = async () => {
    if (value.trim() === formatPhone(user.whatsapp)) return;
    setSaving(true);
    const result = await setUserWhatsapp({ userId: user.id, phone: value });
    setSaving(false);
    if (!result.ok) {
      setError(te(result.error));
      return;
    }
    setError(null);
    setValue(formatPhone(result.data.whatsapp));
    toast.success(result.data.whatsapp ? t("whatsappSaved", { name: user.fullName }) : t("whatsappCleared", { name: user.fullName }));
    router.refresh();
  };

  return (
    <div className="space-y-1 lg:col-span-5 lg:pl-[3.25rem]">
      <label htmlFor={id} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <WhatsAppIcon className="size-3.5 text-whatsapp-text" />
        {t("whatsapp")}
      </label>
      <div className="flex max-w-xs items-center gap-2">
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          className="num"
          placeholder={t("whatsappPlaceholder")}
          value={value}
          aria-invalid={!!error}
          aria-describedby={`${id}-hint`}
          onChange={(e) => setValue(formatPhoneTyping(e.target.value))}
          onBlur={() => void save()}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          data-testid={`user-whatsapp-${user.email}`}
        />
        {saving && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />}
      </div>
      <p id={`${id}-hint`} className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>
        {error ?? t("whatsappHint")}
      </p>
    </div>
  );
}

export function UsersTab({ users, stores, currentUserId }: { users: UserRow[]; stores: StoreSummary[]; currentUserId: string }) {
  const t = useTranslations("settings.users");
  const te = useTranslations("errors");
  const tr = useTranslations("roles");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [inviting, setInviting] = useState(false);
  const [deactivating, setDeactivating] = useState<UserRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const shops = stores.filter((s) => s.kind === "store");

  const run = async (user: UserRow, action: () => Promise<ActionResult>, success: string) => {
    setBusyId(user.id);
    const result = await action();
    setBusyId(null);
    if (!result.ok) {
      toast.error(te(result.error));
      return;
    }
    toast.success(success);
    startTransition(() => router.refresh());
  };

  const update = (user: UserRow, patch: { role?: AppRole; storeId?: string | null; isActive?: boolean }, success: string) => {
    const role = patch.role ?? user.role;
    // Becoming a secretary needs a store: keep hers, else the first store.
    const storeId = role === "super_admin" ? null : (patch.storeId ?? user.storeId ?? shops[0]?.id ?? null);
    return run(user, () => updateUserAccess({ userId: user.id, role, storeId, isActive: patch.isActive ?? user.isActive }), success);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={() => setInviting(true)}>
          <UserPlus />
          {t("invite")}
        </Button>
        <ul className="divide-y rounded-2xl border" data-testid="users-list">
          {users.map((u) => {
            const self = u.id === currentUserId;
            const busy = busyId === u.id;
            return (
              <li key={u.id} className={cn("grid gap-3 p-4 lg:grid-cols-[minmax(0,1.4fr)_12rem_14rem_9rem_auto] lg:items-center", !u.isActive && "bg-muted/40")}>
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-10">
                    <AvatarFallback className={cn("text-sm font-semibold", u.isActive ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>
                      {initials(u.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {u.fullName} {self && <span className="text-xs font-normal text-muted-foreground">({t("you")})</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  </div>
                </div>
                <Select value={u.role} onValueChange={(v) => update(u, { role: v as AppRole }, t("updated", { name: u.fullName, what: t("roleWord") }))} disabled={self || busy}>
                  <SelectTrigger className="w-full" aria-label={`${t("role")} · ${u.fullName}`}>
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
                <Select
                  value={u.role === "super_admin" ? NO_STORE : (u.storeId ?? NO_STORE)}
                  onValueChange={(v) => update(u, { storeId: v }, t("updated", { name: u.fullName, what: t("locationWord") }))}
                  disabled={u.role === "super_admin" || busy}
                >
                  <SelectTrigger className="w-full" aria-label={`${t("location")} · ${u.fullName}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {u.role === "super_admin" && <SelectItem value={NO_STORE}>{t("noLocation")}</SelectItem>}
                    {shops.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <StatusPill status={u.status} />
                  {u.status === "invited" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-full"
                      disabled={busy}
                      aria-label={`${t("resend")} · ${u.fullName}`}
                      title={t("resend")}
                      onClick={() => run(u, () => resendInvite({ userId: u.id }), t("resent", { email: u.email }))}
                    >
                      {busy ? <Loader2 className="animate-spin" /> : <RotateCw />}
                    </Button>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm lg:justify-end">
                  <span className="lg:sr-only">{t("active")}</span>
                  <Switch
                    checked={u.isActive}
                    disabled={self || busy}
                    aria-label={`${t("active")} · ${u.fullName}`}
                    onCheckedChange={(v) => (v ? update(u, { isActive: true }, t("activated", { name: u.fullName })) : setDeactivating(u))}
                  />
                </label>
                {u.role === "super_admin" && <WhatsappField user={u} />}
              </li>
            );
          })}
        </ul>
      </CardContent>
      {inviting && <InviteDialog stores={stores} onClose={() => setInviting(false)} onInvited={() => startTransition(() => router.refresh())} />}
      <ConfirmDialog
        open={!!deactivating}
        onOpenChange={(o) => !o && setDeactivating(null)}
        title={t("deactivateTitle", { name: deactivating?.fullName ?? "" })}
        description={t("deactivateBody")}
        confirmLabel={t("deactivate")}
        onConfirm={async () => {
          if (deactivating) await update(deactivating, { isActive: false }, t("deactivated", { name: deactivating.fullName }));
        }}
      />
    </Card>
  );
}
