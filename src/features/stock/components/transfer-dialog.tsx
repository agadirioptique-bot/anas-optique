"use client";

import { ArrowLeftRight, Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ResponsiveDialog } from "@/components/shared/dialogs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { StoreSummary } from "@/features/auth/types";
import { useSettingsAction } from "@/features/settings/use-settings-action";
import { cn } from "@/lib/utils";
import { createTransfer } from "../actions";
import type { StockRow } from "../queries";
import { Stepper } from "./stock-bits";

export interface TransferPreset {
  fromStoreId?: string;
  categoryId?: string;
}

interface Line {
  key: number;
  categoryId: string;
  qty: number;
}

let seq = 0;

function LocationSelect({
  id,
  value,
  onChange,
  locations,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  locations: StoreSummary[];
  invalid: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {locations.map((l) => (
          <SelectItem key={l.id} value={l.id}>
            {l.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * One-step transfer of several categories (create_transfer): quantities at the source are shown and
 * checked here; the database checks them again under lock.
 */
export function TransferDialog({
  open,
  preset,
  locations,
  levels,
  onClose,
}: {
  open: boolean;
  preset: TransferPreset | null;
  locations: StoreSummary[];
  levels: StockRow[];
  onClose: () => void;
}) {
  const t = useTranslations("transfers");
  const tc = useTranslations("common");
  const run = useSettingsAction();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  // Reset from the preset each time the dialog opens.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const lab = locations.find((l) => l.kind === "lab");
      const source = preset?.fromStoreId ?? lab?.id ?? locations[0]?.id ?? "";
      setFrom(source);
      setTo(locations.find((l) => l.id !== source && l.kind === "store")?.id ?? locations.find((l) => l.id !== source)?.id ?? "");
      setLines([{ key: seq++, categoryId: preset?.categoryId ?? "", qty: 1 }]);
      setNote("");
      setTouched(false);
    }
  }

  const available = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of levels) if (r.storeId === from) map.set(r.categoryId, r.quantity);
    return map;
  }, [levels, from]);
  const categories = useMemo(() => {
    const seen = new Map<string, StockRow>();
    for (const r of levels) if (r.storeId === from && r.quantity > 0) seen.set(r.categoryId, r);
    return [...seen.values()];
  }, [levels, from]);

  const chosen = lines.filter((l) => l.categoryId);
  const short = (l: Line) => !!l.categoryId && l.qty > (available.get(l.categoryId) ?? 0);
  const errors = {
    route: !from || !to || from === to,
    lines: chosen.length === 0,
    shortage: chosen.some(short),
  };
  const valid = !errors.route && !errors.lines && !errors.shortage;
  const count = chosen.reduce((s, l) => s + l.qty, 0);
  const nameOf = (id: string) => locations.find((l) => l.id === id)?.name ?? "";

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    setPending(true);
    const done = await run(
      () =>
        createTransfer({
          fromStoreId: from,
          toStoreId: to,
          lines: chosen.map((l) => ({ categoryId: l.categoryId, qty: l.qty })),
          note: note.trim() || undefined,
        }),
      t("done", { count, from: nameOf(from), to: nameOf(to) }),
    );
    setPending(false);
    if (done) onClose();
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t("new")}
      description={t("description")}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {t("confirm")}
            {count > 0 && <span className="num">· {count}</span>}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <div className="space-y-2">
            <Label htmlFor="transfer-from">{t("from")}</Label>
            <LocationSelect
              id="transfer-from"
              locations={locations}
              invalid={touched && errors.route}
              value={from}
              onChange={(v) => {
                setFrom(v);
                setLines((ls) => ls.map((l) => ({ ...l, categoryId: "" })));
              }}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="justify-self-center"
            onClick={() => {
              setFrom(to);
              setTo(from);
              setLines((ls) => ls.map((l) => ({ ...l, categoryId: "" })));
            }}
            aria-label={t("swap")}
            title={t("swap")}
          >
            <ArrowLeftRight />
          </Button>
          <div className="space-y-2">
            <Label htmlFor="transfer-to">{t("to")}</Label>
            <LocationSelect id="transfer-to" locations={locations} invalid={touched && errors.route} value={to} onChange={setTo} />
          </div>
        </div>
        {touched && errors.route && <p className="text-sm text-destructive">{t("sameLocation")}</p>}

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">{t("lines")}</legend>
          {categories.length === 0 && <p className="text-sm text-muted-foreground">{t("nothingAvailable")}</p>}
          {lines.map((line, i) => {
            const taken = new Set(lines.filter((l) => l.key !== line.key).map((l) => l.categoryId));
            const have = line.categoryId ? (available.get(line.categoryId) ?? 0) : null;
            return (
              <div key={line.key} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_11rem_auto] sm:items-start sm:border-0 sm:p-0">
                <div className="space-y-1">
                  <Label htmlFor={`transfer-cat-${line.key}`} className="sr-only">
                    {t("category")} {i + 1}
                  </Label>
                  <Select value={line.categoryId} onValueChange={(v) => update(line.key, { categoryId: v, qty: 1 })}>
                    <SelectTrigger id={`transfer-cat-${line.key}`} className="w-full">
                      <SelectValue placeholder={t("chooseCategory")} />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.categoryId} value={c.categoryId} disabled={taken.has(c.categoryId)}>
                          {c.categoryName} <span className="num text-muted-foreground">· {t("available", { count: c.quantity })}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {have !== null && (
                    <p className={cn("num text-xs", short(line) ? "text-destructive" : "text-muted-foreground")}>{t("available", { count: have })}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor={`transfer-qty-${line.key}`} className="sr-only">
                    {t("qty")} {i + 1}
                  </Label>
                  <Stepper id={`transfer-qty-${line.key}`} value={line.qty} onChange={(qty) => update(line.key, { qty })} min={1} invalid={short(line)} />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                  disabled={lines.length === 1}
                  aria-label={t("removeLine")}
                  title={t("removeLine")}
                  className="justify-self-end"
                >
                  <Trash2 />
                </Button>
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLines((ls) => [...ls, { key: seq++, categoryId: "", qty: 1 }])}
            disabled={lines.length >= categories.length}
          >
            <Plus />
            {t("addLine")}
          </Button>
          {touched && errors.lines && <p className="text-sm text-destructive">{t("noLines")}</p>}
          {touched && errors.shortage && <p className="text-sm text-destructive">{t("shortage")}</p>}
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor="transfer-note">
            {t("note")} <span className="font-normal text-muted-foreground">({tc("optional")})</span>
          </Label>
          <Textarea id="transfer-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} />
        </div>
      </div>
    </ResponsiveDialog>
  );
}
