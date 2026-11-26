"use client";

import { BadgePercent, Check, Gift, Loader2, Search, UserPlus, UserRound, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { SegmentBadge, WhatsAppIcon } from "@/components/shared/badges";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Link } from "@/i18n/navigation";
import { initials } from "@/lib/format";
import { formatPhone, formatPhoneTyping, normalizePhone } from "@/lib/phone";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";
import { checkSlip, getClientForOrder, searchClientsForOrder, type ClientHit } from "../actions";
import { discountAmount, type OrderFormValues } from "../form";
import { useNewOrder } from "./context";

function SlipField() {
  const t = useTranslations("wizard");
  const f = useFormat();
  const { data, slip, setSlip } = useNewOrder();
  const form = useFormContext<OrderFormValues>();
  const storeId = useWatch({ control: form.control, name: "storeId" });
  const slipNumber = useWatch({ control: form.control, name: "slipNumber" });
  const booklet = useWatch({ control: form.control, name: "booklet" });
  const [showBooklet, setShowBooklet] = useState(booklet !== "");
  const [checking, setChecking] = useState(false);
  const prefix = data.stores.find((s) => s.id === storeId)?.prefix ?? "";
  const error = form.formState.errors.slipNumber;
  // The form object from useFormContext changes on every render; these functions don't.
  const { setValue, setError, clearErrors } = form;

  // Live "already used" check, a moment after typing stops.
  useEffect(() => {
    setSlip(null);
    setValue("slipTaken", false);
    if (!slipNumber || !storeId) return;
    let alive = true;
    const timer = setTimeout(async () => {
      setChecking(true);
      const result = await checkSlip({ storeId, booklet, slipNumber });
      setChecking(false);
      if (!alive) return;
      setSlip(result);
      setValue("slipTaken", result.taken);
      if (result.taken) setError("slipNumber", { message: t("slipTakenShort") });
      else clearErrors("slipNumber");
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [storeId, booklet, slipNumber, setSlip, setValue, setError, clearErrors, t]);

  return (
    <div className="space-y-2">
      <Label htmlFor="slip-number">{t("slip")}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <div className={cn("flex h-12 items-stretch overflow-hidden rounded-lg border bg-card focus-within:ring-3 focus-within:ring-ring/50", error && "border-destructive")}>
          <span className="num grid place-items-center bg-muted px-3 text-lg font-semibold text-muted-foreground">
            {prefix}-{booklet ? `${booklet}-` : ""}
          </span>
          <input
            id="slip-number"
            inputMode="numeric"
            autoComplete="off"
            data-testid="slip-number"
            className="num w-36 bg-transparent px-3 text-lg font-semibold outline-none"
            value={slipNumber ?? ""}
            aria-invalid={!!error}
            aria-describedby="slip-hint"
            onChange={(e) => {
              const n = parseInt(e.target.value.replace(/\D/g, "").slice(0, 9), 10);
              form.setValue("slipNumber", Number.isNaN(n) ? undefined : n, { shouldValidate: form.formState.isSubmitted });
            }}
          />
        </div>
        {showBooklet ? (
          <div className="flex items-center gap-1">
            <Label htmlFor="slip-booklet" className="text-sm font-normal text-muted-foreground">
              {t("booklet")}
            </Label>
            <Input
              id="slip-booklet"
              className="num h-10 w-14 text-center uppercase"
              maxLength={2}
              value={booklet}
              onChange={(e) => form.setValue("booklet", e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("bookletRemove")}
              onClick={() => {
                form.setValue("booklet", "");
                setShowBooklet(false);
              }}
            >
              <X />
            </Button>
          </div>
        ) : (
          <Button type="button" variant="link" size="sm" className="text-muted-foreground" onClick={() => setShowBooklet(true)}>
            {t("bookletAdd")}
          </Button>
        )}
      </div>
      <p id="slip-hint" className="flex items-center gap-1.5 text-sm" aria-live="polite">
        {checking ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : slip?.taken ? (
          <span className="text-destructive">
            {t("slipTaken", { number: slip.display, client: slip.client, date: f.date(slip.date) })}{" "}
            <Link href={`/orders/${slip.orderId}`} className="underline underline-offset-2">
              {t("openOrder")}
            </Link>
          </span>
        ) : slip && !slip.taken ? (
          <span className="flex items-center gap-1 text-success-text">
            <Check className="size-4" aria-hidden="true" />
            {t("slipFree")}
          </span>
        ) : error ? (
          <span className="text-destructive">{error.message}</span>
        ) : (
          <span className="text-muted-foreground">{t("slipHint")}</span>
        )}
      </p>
    </div>
  );
}

function SelectedClient() {
  const t = useTranslations("wizard");
  const f = useFormat();
  const { client, setClient } = useNewOrder();
  const form = useFormContext<OrderFormValues>();
  const applyDiscount = useWatch({ control: form.control, name: "applyDiscount" });
  const total = useWatch({ control: form.control, name: "total" });
  if (!client) return null;
  const segment = client.is_loyal ? "loyal" : client.orders <= 1 ? "new" : "regular";
  const d = client.pendingDiscount;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border bg-accent/40 p-4" data-testid="selected-client">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-base font-semibold text-primary-foreground">{initials(client.full_name)}</span>
        {/* At least 10rem for the name and phone: on a phone « Changer » moves below instead of squeezing them. */}
        <div className="min-w-40 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-lg font-semibold">{client.full_name}</p>
            <SegmentBadge segment={segment} />
          </div>
          <p className="num flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
            {client.has_whatsapp && <WhatsAppIcon className="text-whatsapp" />}
            <span className="whitespace-nowrap">{formatPhone(client.phone_e164)}</span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap">{t("ordersCount", { count: client.orders })}</span>
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="max-sm:w-full"
          onClick={() => {
            form.setValue("clientId", undefined);
            form.setValue("pendingDiscount", null);
            form.setValue("applyDiscount", false);
            setClient(null);
          }}
        >
          {t("change")}
        </Button>
      </div>
      {client.is_loyal && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200 motion-safe:animate-pop-in">
          <Gift className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t("loyalBanner")}</p>
            <p className="text-sm opacity-90">{t("loyalSinceBody", { count: client.orders, date: client.loyal_since ? f.date(client.loyal_since) : "—" })}</p>
          </div>
        </div>
      )}
      {d && (
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4" data-testid="pending-discount">
          <BadgePercent className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{t("discountBanner", { value: d.type === "percent" ? `${d.value} %` : f.money(d.value) })}</span>
            <span className="block text-sm text-muted-foreground">
              {d.note ?? t("discountBannerHint")}
              {applyDiscount && total ? ` · −${f.money(discountAmount(total, d, true))}` : ""}
            </span>
          </span>
          <span className="text-sm font-medium">{t("applyDiscount")}</span>
          <Switch checked={applyDiscount} onCheckedChange={(v) => form.setValue("applyDiscount", v, { shouldValidate: form.formState.isSubmitted })} />
        </label>
      )}
    </div>
  );
}

function ClientSearch() {
  const t = useTranslations("wizard");
  const f = useFormat();
  const { setClient } = useNewOrder();
  const form = useFormContext<OrderFormValues>();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ClientHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const error = form.formState.errors.clientId;

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      const rows = await searchClientsForOrder(query);
      if (alive) {
        setHits(rows);
        setLoading(false);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  const pick = async (id: string) => {
    setPicking(id);
    const c = await getClientForOrder(id);
    setPicking(null);
    if (!c) return;
    setClient(c);
    form.setValue("clientMode", "existing");
    form.setValue("clientId", c.id, { shouldValidate: form.formState.isSubmitted });
    form.setValue("pendingDiscount", c.pendingDiscount ? { type: c.pendingDiscount.type, value: c.pendingDiscount.value } : null);
    form.setValue("applyDiscount", !!c.pendingDiscount);
    form.clearErrors("clientId");
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="client-search">{t("searchClient")}</Label>
      <Command shouldFilter={false} className="rounded-2xl! border bg-card p-0">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            id="client-search"
            autoComplete="off"
            data-testid="client-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchClientPlaceholder")}
            className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
            aria-invalid={!!error}
          />
          {loading && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />}
        </div>
        {/* The listbox exists only with options in it (ARIA: a listbox owns options); "no client" is a status. */}
        {hits.length > 0 ? (
          <CommandList className="max-h-80">
            <CommandGroup heading={query ? undefined : t("recentClients")}>
              {hits.map((c) => (
                <CommandItem key={c.id} value={c.id} onSelect={() => void pick(c.id)} className="gap-3 rounded-xl px-3 py-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{initials(c.full_name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.full_name}</span>
                    <span className="num flex items-center gap-1 text-xs text-muted-foreground">
                      {c.has_whatsapp && <WhatsAppIcon className="size-3.5 text-whatsapp" />}
                      {formatPhone(c.phone_e164)} · {c.last_order_at ? t("lastVisit", { date: f.date(c.last_order_at) }) : t("neverVisited")}
                    </span>
                  </span>
                  {picking === c.id ? <Loader2 className="size-4 animate-spin" /> : <SegmentBadge segment={c.segment} className="hidden sm:inline-flex" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        ) : (
          !loading && (
            <div role="status" className="px-4 py-6 text-center text-sm">
              <p className="text-muted-foreground">{t("noClientFound")}</p>
              {query.trim() && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    const digits = query.replace(/\D/g, "");
                    form.setValue("clientMode", "new");
                    if (digits.length >= 6) form.setValue("newClient.phone", formatPhoneTyping(digits));
                    else form.setValue("newClient.fullName", query.trim());
                  }}
                >
                  <UserPlus />
                  {t("createInstead", { name: query.trim() })}
                </Button>
              )}
            </div>
          )
        )}
      </Command>
      {error && <p className="text-sm text-destructive">{error.message}</p>}
    </div>
  );
}

function NewClientFields() {
  const t = useTranslations("wizard");
  const tc = useTranslations("common");
  const { setClient } = useNewOrder();
  const form = useFormContext<OrderFormValues>();
  const newClient = useWatch({ control: form.control, name: "newClient" });
  const { errors } = form.formState;
  const e164 = normalizePhone(newClient.phone);
  const [lookup, setLookup] = useState<{ phone: string; hits: ClientHit[] } | null>(null);
  const existing = lookup && lookup.phone === e164 ? lookup.hits : [];

  // Same phone already registered (a family may share one): offer to use that client,
  // creating another client on the same number stays possible (SPEC §5.3).
  useEffect(() => {
    if (!e164) return;
    let alive = true;
    void searchClientsForOrder(e164).then((rows) => alive && setLookup({ phone: e164, hits: rows.filter((r) => r.phone_e164 === e164) }));
    return () => {
      alive = false;
    };
  }, [e164]);

  const pickExisting = async (id: string) => {
    const c = await getClientForOrder(id);
    if (!c) return;
    setClient(c);
    form.setValue("clientMode", "existing");
    form.setValue("clientId", c.id);
    form.setValue("pendingDiscount", c.pendingDiscount ? { type: c.pendingDiscount.type, value: c.pendingDiscount.value } : null);
    form.setValue("applyDiscount", !!c.pendingDiscount);
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="new-client-name">{t("fullName")}</Label>
        <Input
          id="new-client-name"
          autoComplete="off"
          autoCapitalize="words"
          maxLength={120}
          placeholder={t("fullNamePlaceholder")}
          aria-invalid={!!errors.newClient?.fullName}
          {...form.register("newClient.fullName")}
        />
        {errors.newClient?.fullName && <p className="text-sm text-destructive">{errors.newClient.fullName.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-client-phone">{t("phone")}</Label>
        <Input
          id="new-client-phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder={t("phonePlaceholder")}
          className="num"
          aria-invalid={!!errors.newClient?.phone}
          value={newClient.phone}
          onChange={(e) => form.setValue("newClient.phone", formatPhoneTyping(e.target.value), { shouldValidate: form.formState.isSubmitted })}
        />
        {errors.newClient?.phone && <p className="text-sm text-destructive">{errors.newClient.phone.message}</p>}
        {existing.length > 0 && (
          <div className="space-y-2 rounded-xl bg-attention/10 p-3 text-sm text-attention-text" role="status">
            <p className="font-medium">{t("phoneTaken")}</p>
            <ul className="space-y-1.5">
              {existing.map((hit) => (
                <li key={hit.id}>
                  <Button type="button" variant="outline" size="sm" onClick={() => void pickExisting(hit.id)}>
                    {t("useExisting")}
                    {tc("colon")} {hit.full_name}
                  </Button>
                </li>
              ))}
            </ul>
            <p className="text-xs">{t("phoneSharedHint")}</p>
          </div>
        )}
      </div>
      <label
        htmlFor="new-client-whatsapp"
        className={cn("flex cursor-pointer items-center gap-3 self-start rounded-xl border p-3 transition-colors sm:mt-7", newClient.hasWhatsapp && "border-whatsapp/40 bg-whatsapp/5")}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-whatsapp/10 text-whatsapp">
          <WhatsAppIcon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t("whatsapp")}</span>
          <span className="block text-xs text-muted-foreground">{t("whatsappHint")}</span>
        </span>
        <Switch id="new-client-whatsapp" checked={newClient.hasWhatsapp} onCheckedChange={(v) => form.setValue("newClient.hasWhatsapp", v)} />
      </label>
    </div>
  );
}

export function StepClient() {
  const t = useTranslations("wizard");
  const { data, client } = useNewOrder();
  const form = useFormContext<OrderFormValues>();
  const mode = useWatch({ control: form.control, name: "clientMode" });
  const storeId = useWatch({ control: form.control, name: "storeId" });

  return (
    <div className="space-y-6">
      {data.stores.length > 1 ? (
        <div className="space-y-2">
          <Label htmlFor="order-store">{t("location")}</Label>
          <Select value={storeId} onValueChange={(v) => form.setValue("storeId", v)}>
            <SelectTrigger id="order-store" className="w-full sm:w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("storeFixed", { store: data.stores[0]?.name ?? "—" })}</p>
      )}

      <SlipField />

      <div className="space-y-4 border-t pt-5">
        <ChoiceChips
          label={t("steps.client")}
          value={mode}
          onChange={(v) => form.setValue("clientMode", v as OrderFormValues["clientMode"])}
          options={[
            {
              value: "existing",
              label: (
                <>
                  <UserRound className="size-4" />
                  {t("existingClient")}
                </>
              ),
            },
            {
              value: "new",
              label: (
                <>
                  <UserPlus className="size-4" />
                  {t("newClient")}
                </>
              ),
            },
          ]}
        />
        {mode === "existing" ? client ? <SelectedClient /> : <ClientSearch /> : <NewClientFields />}
      </div>
    </div>
  );
}
