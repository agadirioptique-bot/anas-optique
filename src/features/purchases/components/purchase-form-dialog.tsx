"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Money } from "@/components/shared/badges";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { ResponsiveDialog } from "@/components/shared/dialogs";
import { MoneyInput } from "@/components/shared/money-input";
import { Stepper } from "@/components/shared/stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { localized } from "@/lib/localized";
import { cn } from "@/lib/utils";
import { createPurchase } from "../actions";
import { lineTotal, percentOf, purchaseTotal, todayIso } from "../lib";
import type { PurchaseReference } from "../queries";
import { SupplierDialog } from "./supplier-dialog";

type Line =
  | { key: number; kind: "stock"; categoryId: string; unitPrice?: number; qty: number }
  | { key: number; kind: "lens"; description: string; amount?: number };

type PayChoice = "none" | "full" | "half" | "third" | "custom";
const PCT: Record<Exclude<PayChoice, "none" | "custom">, number> = { full: 100, half: 50, third: 30 };

let seq = 0;
const newStock = (): Line => ({ key: seq++, kind: "stock", categoryId: "", unitPrice: undefined, qty: 1 });
const newLens = (): Line => ({ key: seq++, kind: "lens", description: "", amount: undefined });

const complete = (l: Line) => (l.kind === "stock" ? !!l.categoryId && l.unitPrice !== undefined && l.qty > 0 : !!l.description.trim() && l.amount !== undefined);

/**
 * New purchase = goods received (create_purchase): stock lines by category (unit price × qty), lens
 * lines (description + amount), live total, optional first payment. Opens the detail page after.
 */
export function PurchaseFormDialog({ open, reference, onClose }: { open: boolean; reference: PurchaseReference; onClose: () => void }) {
  const t = useTranslations("purchases.form");
  const tp = useTranslations("purchases");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [date, setDate] = useState("");
  const [ref, setRef] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [pay, setPay] = useState<PayChoice>("none");
  const [custom, setCustom] = useState<number | undefined>();
  const [methodId, setMethodId] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const today = todayIso();
      setSupplierId("");
      setStoreId(reference.locations.find((l) => l.kind === "lab")?.id ?? reference.locations[0]?.id ?? "");
      setDate(today);
      setRef("");
      setLines([newStock()]);
      setPay("none");
      setCustom(undefined);
      setMethodId(reference.methods[0]?.id ?? "");
      setPaidAt(today);
      setNote("");
      setTouched(false);
    }
  }

  const types = useMemo(() => {
    const groups = new Map<string, { label: string; categories: PurchaseReference["categories"] }>();
    for (const c of reference.categories) {
      const g = groups.get(c.typeId) ?? { label: localized({ label_fr: c.typeLabelFr, label_en: c.typeLabelEn }, locale), categories: [] };
      g.categories.push(c);
      groups.set(c.typeId, g);
    }
    return [...groups.entries()];
  }, [reference.categories, locale]);

  const total = purchaseTotal(lines);
  const payAmount = pay === "none" ? 0 : pay === "custom" ? (custom ?? 0) : percentOf(total, PCT[pay]);
  const today = todayIso();
  const errors = {
    supplier: !supplierId,
    location: !storeId,
    date: !date || date > today,
    lines: lines.length === 0 || !lines.every(complete),
    pay: pay !== "none" && (payAmount <= 0 || payAmount > total),
    method: pay !== "none" && !methodId,
    paidAt: pay !== "none" && (!paidAt || paidAt > today),
  };
  const valid = !Object.values(errors).some(Boolean);

  const update = (key: number, patch: Partial<Omit<Line, "key" | "kind">>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? ({ ...l, ...patch } as Line) : l)));
  const remove = (key: number) => setLines((ls) => ls.filter((l) => l.key !== key));
  const chosen = new Set(lines.flatMap((l) => (l.kind === "stock" && l.categoryId ? [l.categoryId] : [])));

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    setPending(true);
    const result = await createPurchase({
      supplierId,
      receiveStoreId: storeId,
      purchaseDate: date,
      supplierRef: ref.trim() || undefined,
      note: note.trim() || undefined,
      lines: lines.map((l) =>
        l.kind === "stock"
          ? { kind: "stock", categoryId: l.categoryId, unitPrice: l.unitPrice!, qty: l.qty }
          : { kind: "lens", description: l.description.trim(), amount: l.amount! },
      ),
      payment: pay === "none" ? undefined : { amount: payAmount, methodId, paidAt },
    });
    setPending(false);
    if (!result.ok) {
      toast.error(te(result.error));
      return;
    }
    toast.success(t("done"));
    onClose();
    router.push(`/purchases/${result.data.id}`);
  };

  const stockLines = lines.filter((l) => l.kind === "stock");
  const lensLines = lines.filter((l) => l.kind === "lens");

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={(o) => !o && onClose()}
        title={tp("new")}
        description={t("description")}
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button onClick={() => void submit()} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {t("confirm")}
              {total > 0 && (
                <span className="num">
                  · <Money value={total} />
                </span>
              )}
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="po-supplier">{t("supplier")}</Label>
              <div className="flex gap-2">
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger id="po-supplier" className="w-full" aria-invalid={touched && errors.supplier}>
                    <SelectValue placeholder={t("chooseSupplier")} />
                  </SelectTrigger>
                  <SelectContent>
                    {reference.suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" onClick={() => setSupplierOpen(true)} aria-label={t("newSupplier")} title={t("newSupplier")}>
                  <Plus />
                </Button>
              </div>
              {touched && errors.supplier && <p className="text-sm text-destructive">{t("errors.supplier")}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-location">{t("receivedAt")}</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger id="po-location" className="w-full" aria-invalid={touched && errors.location}>
                  <SelectValue placeholder={t("chooseLocation")} />
                </SelectTrigger>
                <SelectContent>
                  {reference.locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {touched && errors.location && <p className="text-sm text-destructive">{t("errors.location")}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-date">{t("date")}</Label>
              <Input id="po-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-invalid={touched && errors.date} />
              {touched && errors.date && <p className="text-sm text-destructive">{t("errors.date")}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-ref">
                {t("ref")} <span className="font-normal text-muted-foreground">({tc("optional")})</span>
              </Label>
              <Input id="po-ref" value={ref} maxLength={60} onChange={(e) => setRef(e.target.value)} placeholder={t("refPlaceholder")} />
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-semibold">{t("stockLines")}</legend>
            {stockLines.map((line) => {
              if (line.kind !== "stock") return null;
              const bad = touched && !complete(line);
              return (
                <div
                  key={line.key}
                  className={cn(
                    "grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_8.5rem_9.5rem_6.5rem_auto] sm:items-center sm:border-0 sm:p-0",
                    bad && "border-destructive",
                  )}
                >
                  <Select value={line.categoryId} onValueChange={(v) => update(line.key, { categoryId: v })}>
                    <SelectTrigger className="w-full" aria-label={t("category")} aria-invalid={bad && !line.categoryId}>
                      <SelectValue placeholder={t("chooseCategory")} />
                    </SelectTrigger>
                    <SelectContent>
                      {types.map(([typeId, g]) => (
                        <SelectGroup key={typeId}>
                          <SelectLabel>{g.label}</SelectLabel>
                          {g.categories.map((c) => (
                            <SelectItem key={c.id} value={c.id} disabled={chosen.has(c.id) && c.id !== line.categoryId}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <MoneyInput
                    value={line.unitPrice}
                    onChange={(v) => update(line.key, { unitPrice: v })}
                    aria-label={t("unitPrice")}
                    placeholder={t("unitPrice")}
                    invalid={bad && line.unitPrice === undefined}
                  />
                  <Stepper id={`po-qty-${line.key}`} value={line.qty} onChange={(qty) => update(line.key, { qty })} min={1} max={9999} />
                  <span className="num text-right text-sm font-medium" aria-label={t("lineTotal")}>
                    <Money value={lineTotal(line)} />
                  </span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(line.key)} aria-label={t("removeLine")} title={t("removeLine")} className="justify-self-end">
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, newStock()])}>
              <Plus />
              {t("addStock")}
            </Button>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-semibold">{t("lensLines")}</legend>
            {lensLines.map((line) => {
              if (line.kind !== "lens") return null;
              const bad = touched && !complete(line);
              return (
                <div key={line.key} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_8.5rem_auto] sm:items-center sm:border-0 sm:p-0">
                  <Input
                    value={line.description}
                    maxLength={200}
                    onChange={(e) => update(line.key, { description: e.target.value })}
                    placeholder={t("descriptionPlaceholder")}
                    aria-label={t("description2")}
                    aria-invalid={bad && !line.description.trim()}
                  />
                  <MoneyInput
                    value={line.amount}
                    onChange={(v) => update(line.key, { amount: v })}
                    aria-label={t("amount")}
                    placeholder={t("amount")}
                    invalid={bad && line.amount === undefined}
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(line.key)} aria-label={t("removeLine")} title={t("removeLine")} className="justify-self-end">
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, newLens()])}>
              <Plus />
              {t("addLens")}
            </Button>
          </fieldset>
          {touched && errors.lines && <p className="text-sm text-destructive">{t("errors.lines")}</p>}

          <div className="flex items-baseline justify-between rounded-xl bg-muted/60 px-4 py-3">
            <span className="text-sm text-muted-foreground">{t("total")}</span>
            <Money value={total} className="text-2xl font-bold text-primary" />
          </div>

          <div className="space-y-3">
            <Label>{t("payNow")}</Label>
            <ChoiceChips
              label={t("payNow")}
              value={pay}
              onChange={(v) => setPay((v || "none") as PayChoice)}
              options={(["full", "half", "third", "custom", "none"] as const).map((c) => ({ value: c, label: t(`payChoices.${c}`) }))}
              itemClassName="h-9 px-3 pointer-coarse:h-10"
            />
            {pay !== "none" && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="po-pay-amount">{t("payAmount")}</Label>
                  {pay === "custom" ? (
                    <MoneyInput id="po-pay-amount" value={custom} onChange={setCustom} invalid={touched && errors.pay} />
                  ) : (
                    <p id="po-pay-amount" className="flex h-10 items-center">
                      <Money value={payAmount} className="text-lg font-semibold" />
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="po-method">{t("method")}</Label>
                  <Select value={methodId} onValueChange={setMethodId}>
                    <SelectTrigger id="po-method" className="w-full" aria-invalid={touched && errors.method}>
                      <SelectValue placeholder={t("chooseMethod")} />
                    </SelectTrigger>
                    <SelectContent>
                      {reference.methods.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {localized(m, locale)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="po-paid-at">{t("paidAt")}</Label>
                  <Input id="po-paid-at" type="date" value={paidAt} max={today} onChange={(e) => setPaidAt(e.target.value)} aria-invalid={touched && errors.paidAt} />
                </div>
                {touched && errors.pay && <p className="text-sm text-destructive sm:col-span-3">{t("errors.payTooHigh")}</p>}
                {touched && errors.method && <p className="text-sm text-destructive sm:col-span-3">{t("errors.method")}</p>}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="po-note">
              {t("note")} <span className="font-normal text-muted-foreground">({tc("optional")})</span>
            </Label>
            <Textarea id="po-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      </ResponsiveDialog>
      <SupplierDialog open={supplierOpen} supplier={null} onClose={() => setSupplierOpen(false)} onSaved={setSupplierId} />
    </>
  );
}
