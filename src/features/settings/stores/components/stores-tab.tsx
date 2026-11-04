"use client";

import { FlaskConical, Loader2, Lock, MapPin, Pencil, Phone, Plus, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { ConfirmDialog, ResponsiveDialog } from "@/components/shared/dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { useSettingsAction } from "../../use-settings-action";
import { createStore, setStoreActive, updateStore } from "../actions";
import type { StoreRow } from "../queries";

const PREFIX_RE = /^[A-Z]{2,5}$/;

function StoreDialog({ store, hasLab, onClose }: { store?: StoreRow; hasLab: boolean; onClose: () => void }) {
  const t = useTranslations("settings.stores");
  const tc = useTranslations("common");
  const run = useSettingsAction();
  const [name, setName] = useState(store?.name ?? "");
  const [kind, setKind] = useState<"store" | "lab">(store?.kind ?? "store");
  const [prefix, setPrefix] = useState(store?.prefix ?? "");
  const [address, setAddress] = useState(store?.address ?? "");
  const [phone, setPhone] = useState(formatPhone(store?.phone));
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const locked = (store?.orders ?? 0) > 0;
  const nameOk = name.trim().length >= 2;
  const prefixOk = PREFIX_RE.test(prefix);
  const phoneOk = !phone.trim() || normalizePhone(phone) !== null;

  const save = async () => {
    setTouched(true);
    if (!nameOk || !prefixOk || !phoneOk) return;
    setPending(true);
    const input = { name, prefix, address, phone };
    const done = store
      ? await run(() => updateStore({ id: store.id, ...input }), t("saved", { name: name.trim() }))
      : await run(() => createStore({ ...input, kind }), t("created", { name: name.trim() }));
    setPending(false);
    if (done) onClose();
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={store ? t("editTitle") : t("createTitle")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="st-name">{t("name")}</Label>
          <Input id="st-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} aria-invalid={touched && !nameOk} />
          {touched && !nameOk && <p className="text-sm text-destructive">{t("nameRequired")}</p>}
        </div>
        {!store && (
          <div className="space-y-2">
            <Label>{t("type")}</Label>
            <ChoiceChips
              label={t("type")}
              value={kind}
              onChange={(v) => setKind(v as "store" | "lab")}
              options={[
                { value: "store", label: t("kinds.store") },
                { value: "lab", label: t("kinds.lab"), disabled: hasLab },
              ]}
            />
            {hasLab && <p className="text-xs text-muted-foreground">{t("oneLab")}</p>}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="st-prefix" className="flex items-center gap-2">
            {t("prefix")}
            {locked && (
              <Badge variant="secondary" className="gap-1">
                <Lock className="size-3" aria-hidden="true" />
                {t("locked")}
              </Badge>
            )}
          </Label>
          <Input
            id="st-prefix"
            value={prefix}
            disabled={locked}
            maxLength={5}
            autoCapitalize="characters"
            className="num w-32 uppercase"
            onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
            aria-invalid={touched && !prefixOk}
            aria-describedby="st-prefix-hint"
          />
          <p id="st-prefix-hint" className={cn("text-xs", touched && !prefixOk ? "text-destructive" : "text-muted-foreground")}>
            {locked ? t("prefixLockedHint") : t("prefixHint", { example: `${prefix || "CNT"}-00832` })}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="st-address">{t("address")}</Label>
          <Input id="st-address" value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="st-phone">{t("phone")}</Label>
          <Input id="st-phone" type="tel" inputMode="tel" className="num" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05 37 00 00 00" aria-invalid={touched && !phoneOk} />
          {touched && !phoneOk && <p className="text-sm text-destructive">{t("phoneInvalid")}</p>}
        </div>
      </div>
    </ResponsiveDialog>
  );
}

export function StoresTab({ stores }: { stores: StoreRow[] }) {
  const t = useTranslations("settings.stores");
  const run = useSettingsAction();
  const [editing, setEditing] = useState<StoreRow | "new" | null>(null);
  const [deactivating, setDeactivating] = useState<StoreRow | null>(null);
  const hasLab = stores.some((s) => s.kind === "lab");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={() => setEditing("new")}>
          <Plus />
          {t("add")}
        </Button>
        <ul className="grid gap-4 md:grid-cols-2">
          {stores.map((s) => {
            const Icon = s.kind === "lab" ? FlaskConical : Store;
            return (
              <li key={s.id} className={cn("rounded-2xl border p-4", !s.isActive && "bg-muted/60")}>
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{s.name}</p>
                      <Badge variant="secondary">{t(`kinds.${s.kind}`)}</Badge>
                      <Badge variant="outline" className="num gap-1">
                        {s.orders > 0 && <Lock className="size-3" aria-label={t("locked")} />}
                        {s.prefix}
                      </Badge>
                    </div>
                    <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      {s.address || "—"}
                    </p>
                    {s.phone && (
                      <p className="num mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Phone className="size-3.5" aria-hidden="true" />
                        {formatPhone(s.phone)}
                      </p>
                    )}
                    <p className="num mt-2 text-xs text-muted-foreground">
                      {s.kind === "store" ? `${t("orders", { count: s.orders })} · ${t("secretaries", { count: s.secretaries })}` : t("labHint")}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(s)} aria-label={`${t("editTitle")} · ${s.name}`}>
                    <Pencil />
                  </Button>
                </div>
                <label className="mt-3 flex items-center justify-end gap-2 text-sm">
                  {t("active")}
                  <Switch
                    checked={s.isActive}
                    aria-label={`${t("active")} · ${s.name}`}
                    onCheckedChange={(v) => (v ? run(() => setStoreActive({ id: s.id, active: true }), t("activated", { name: s.name })) : setDeactivating(s))}
                  />
                </label>
              </li>
            );
          })}
        </ul>
        {editing && <StoreDialog key={editing === "new" ? "new" : editing.id} store={editing === "new" ? undefined : editing} hasLab={hasLab} onClose={() => setEditing(null)} />}
        <ConfirmDialog
          open={!!deactivating}
          onOpenChange={(o) => !o && setDeactivating(null)}
          title={t("deactivateTitle", { name: deactivating?.name ?? "" })}
          description={
            <>
              <p>{t("deactivateBody")}</p>
              {(deactivating?.secretaries ?? 0) > 0 && <p className="font-medium text-destructive">{t("deactivateSecretaries", { count: deactivating!.secretaries })}</p>}
            </>
          }
          confirmLabel={t("deactivate")}
          onConfirm={async () => {
            if (deactivating) await run(() => setStoreActive({ id: deactivating.id, active: false }), t("deactivated", { name: deactivating.name }));
          }}
        />
      </CardContent>
    </Card>
  );
}
