"use client";

import { Check, Glasses, Minus, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { MoneyInput } from "@/components/shared/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { localized } from "@/lib/localized";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";
import { discountAmount, itemsPrice, type OrderFormValues } from "../form";
import { useNewOrder } from "./context";

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Frames: category cards with the store's stock (SPEC §8); other types: quantities. */
function ProductsPicker() {
  const t = useTranslations("wizard");
  const locale = useLocale();
  const f = useFormat();
  const { data } = useNewOrder();
  const form = useFormContext<OrderFormValues>();
  const storeId = useWatch({ control: form.control, name: "storeId" });
  const ownFrame = useWatch({ control: form.control, name: "ownFrame" });
  const frameCategoryId = useWatch({ control: form.control, name: "frameCategoryId" });
  const items = useWatch({ control: form.control, name: "items" });
  const [typeId, setTypeId] = useState(data.productTypes.find((ty) => ty.is_frame)?.id ?? data.productTypes[0]?.id ?? "");
  const type = data.productTypes.find((ty) => ty.id === typeId);
  const categories = data.categories.filter((c) => c.typeId === typeId);
  const stockOf = (categoryId: string) => data.stock[`${storeId}:${categoryId}`] ?? 0;
  const error = form.formState.errors.frameCategoryId;
  const validate = { shouldValidate: form.formState.isSubmitted };

  return (
    <Section title={t("products")}>
      <ChoiceChips
        label={t("products")}
        value={typeId}
        onChange={setTypeId}
        options={data.productTypes.map((ty) => {
          const count = ty.is_frame ? (ownFrame || frameCategoryId ? 1 : 0) : data.categories.filter((c) => c.typeId === ty.id).reduce((s, c) => s + (items[c.id] ?? 0), 0);
          return { value: ty.id, label: count > 0 ? `${localized(ty, locale)} · ${count}` : localized(ty, locale) };
        })}
      />

      {type?.is_frame ? (
        <div className="space-y-3">
          <label
            htmlFor="own-frame"
            className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors", ownFrame && "border-primary/50 bg-primary/5")}
          >
            <Glasses className="size-5 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t("clientFrame")}</span>
              <span className="block text-xs text-muted-foreground">{t("clientFrameHint")}</span>
            </span>
            <Switch
              id="own-frame"
              checked={ownFrame}
              onCheckedChange={(v) => {
                form.setValue("ownFrame", v, validate);
                if (v) form.setValue("frameCategoryId", undefined, validate);
              }}
            />
          </label>
          {!ownFrame && (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label={t("frame")}>
              {categories.map((c) => {
                const stock = stockOf(c.id);
                const selected = frameCategoryId === c.id;
                const card = (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={stock <= 0}
                    data-testid={`frame-${c.name}`}
                    onClick={() => form.setValue("frameCategoryId", selected ? undefined : c.id, validate)}
                    className={cn(
                      "relative flex w-full flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-all",
                      selected ? "border-primary bg-primary/5 ring-2 ring-primary" : "hover:border-primary/40",
                      stock <= 0 && "cursor-not-allowed opacity-50",
                    )}
                  >
                    {selected && (
                      <span className="absolute top-3 right-3 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-4" aria-hidden="true" />
                      </span>
                    )}
                    <span className="font-semibold">{c.name}</span>
                    <span className="num text-lg font-bold">{f.money(c.salePrice)}</span>
                    <span className={cn("num text-xs", stock <= 0 ? "text-destructive" : "text-muted-foreground")}>{stock <= 0 ? t("outOfStock") : t("inStock", { count: stock })}</span>
                  </button>
                );
                return (
                  <li key={c.id}>
                    {stock <= 0 ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="block">{card}</span>
                        </TooltipTrigger>
                        <TooltipContent>{t("outOfStockHint")}</TooltipContent>
                      </Tooltip>
                    ) : (
                      card
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <ul className="divide-y rounded-2xl border">
          {categories.map((c) => {
            const stock = stockOf(c.id);
            const qty = items[c.id] ?? 0;
            const set = (n: number) => form.setValue("items", { ...items, [c.id]: Math.max(0, Math.min(stock, n)) }, validate);
            return (
              <li key={c.id} className={cn("flex items-center gap-3 p-3", stock <= 0 && qty === 0 && "opacity-60")}>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{c.name}</span>
                  <span className="num text-xs text-muted-foreground">
                    {f.money(c.salePrice)} · {stock <= 0 ? t("outOfStock") : t("inStock", { count: stock })}
                  </span>
                </span>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="outline" size="icon-sm" disabled={qty <= 0} onClick={() => set(qty - 1)} aria-label={t("qtyLess", { name: c.name })}>
                    <Minus />
                  </Button>
                  <span className="num w-8 text-center font-semibold">{qty}</span>
                  <Button type="button" variant="outline" size="icon-sm" disabled={qty >= stock} onClick={() => set(qty + 1)} aria-label={t("qtyMore", { name: c.name })}>
                    <Plus />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
    </Section>
  );
}

function LensPicker() {
  const t = useTranslations("wizard");
  const locale = useLocale();
  const { data } = useNewOrder();
  const form = useFormContext<OrderFormValues>();
  const lensTypeId = useWatch({ control: form.control, name: "lensTypeId" });
  const treatments = useWatch({ control: form.control, name: "treatmentIds" });
  return (
    <Section title={t("lenses")}>
      <p className="-mt-2 text-sm text-muted-foreground">{t("lensesNoPrice")}</p>
      <div className="space-y-2">
        <Label>{t("lensType")}</Label>
        <ChoiceChips
          label={t("lensType")}
          value={lensTypeId}
          allowEmpty
          onChange={(v) => form.setValue("lensTypeId", v || undefined)}
          options={data.lensTypes.map((o) => ({ value: o.id, label: localized(o, locale) }))}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("treatments")}</Label>
        <ChoiceChips multiple label={t("treatments")} value={treatments} onChange={(v) => form.setValue("treatmentIds", v)} options={data.treatments.map((o) => ({ value: o.id, label: localized(o, locale) }))} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="lens-details" className="text-muted-foreground">
          {t("lensDescription")}
        </Label>
        <Input id="lens-details" maxLength={500} placeholder={t("lensDescriptionPlaceholder")} {...form.register("lensDetails")} />
      </div>
    </Section>
  );
}

function PaymentSection() {
  const t = useTranslations("wizard");
  const locale = useLocale();
  const f = useFormat();
  const { data } = useNewOrder();
  const form = useFormContext<OrderFormValues>();
  const v = useWatch({ control: form.control }) as OrderFormValues;
  const { errors, isSubmitted } = form.formState;
  const minimum = itemsPrice(v, data);
  const discount = discountAmount(v.total, v.pendingDiscount, v.clientMode === "existing" && v.applyDiscount);
  const net = Math.max(0, (v.total ?? 0) - discount);
  const reste = Math.max(0, net - (v.deposit ?? 0));
  const setMoney = (name: "total" | "deposit", value: number | undefined) => form.setValue(name, value, { shouldValidate: isSubmitted });

  return (
    <Section title={t("payment")}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="order-total">{t("total")}</Label>
          <MoneyInput id="order-total" size="lg" value={v.total} onChange={(n) => setMoney("total", n)} invalid={!!errors.total} aria-describedby="order-total-msg" />
          {errors.total ? (
            <p id="order-total-msg" className="text-sm text-destructive">
              {errors.total.message}
            </p>
          ) : minimum > 0 ? (
            <p id="order-total-msg" className="flex items-center gap-2 text-sm text-muted-foreground">
              {t("itemsMinimum", { amount: f.money(minimum) })}
              {v.total === undefined && (
                <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => setMoney("total", minimum)}>
                  {t("useCatalogPrice")}
                </Button>
              )}
            </p>
          ) : null}
          {discount > 0 && (
            <p className="num text-sm font-medium text-primary">
              {t("discountLine", { amount: f.money(discount) })} → {f.money(net)}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="order-deposit">{t("deposit")}</Label>
          <MoneyInput id="order-deposit" size="lg" value={v.deposit} onChange={(n) => setMoney("deposit", n)} invalid={!!errors.deposit} aria-describedby="order-deposit-msg" />
          <div className="flex gap-2" role="group" aria-label={t("depositChips")}>
            {[0.3, 0.5, 1].map((ratio) => (
              <Button
                key={ratio}
                type="button"
                variant="outline"
                size="sm"
                className="num flex-1 rounded-full"
                disabled={!net}
                onClick={() => setMoney("deposit", ratio === 1 ? net : Math.round((net * ratio) / 10) * 10)}
              >
                {ratio * 100} %
              </Button>
            ))}
          </div>
          {errors.deposit && (
            <p id="order-deposit-msg" className="text-sm text-destructive">
              {errors.deposit.message}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t("paymentMethod")}</Label>
        <ChoiceChips label={t("paymentMethod")} value={v.paymentMethodId} onChange={(id) => form.setValue("paymentMethodId", id)} options={data.paymentMethods.map((m) => ({ value: m.id, label: localized(m, locale) }))} />
        {errors.paymentMethodId && <p className="text-sm text-destructive">{errors.paymentMethodId.message}</p>}
      </div>
      <div
        className={cn("flex items-center justify-between rounded-2xl px-5 py-4 transition-colors", reste > 0 ? "bg-attention/10 text-attention-text" : "bg-success/10 text-success-text")}
        aria-live="polite"
      >
        <span className="font-medium">{t("reste")}</span>
        <span className="num text-3xl font-bold tracking-tight" data-testid="order-balance">
          {f.money(reste)}
        </span>
      </div>
    </Section>
  );
}

export function StepProducts() {
  return (
    <div className="space-y-8">
      <ProductsPicker />
      <div className="border-t" />
      <LensPicker />
      <div className="border-t" />
      <PaymentSection />
    </div>
  );
}
