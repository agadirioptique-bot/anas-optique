"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronUp, Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { FormProvider, useForm, useWatch, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { WhatsAppIcon } from "@/components/shared/badges";
import { ResponsiveDialog } from "@/components/shared/dialogs";
import { PageHeader } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useShell } from "@/components/layout/shell-context";
import { Link } from "@/i18n/navigation";
import type { ErrorCode } from "@/lib/errors";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";
import { uploadPrescriptionPhoto } from "@/features/orders/lib/photo-upload";
import { NotifyAdminDialog } from "@/features/orders/components/notify-admin";
import { createOrder } from "../actions";
import type { NewOrderData } from "../data";
import { buildOrderSchema, defaultValues, discountAmount, STEP_FIELDS, stepFields, STEPS, toPayload, type OrderFormValues } from "../form";
import { NewOrderProvider, useNewOrder } from "./context";
import { OrderSummary } from "./order-summary";
import { StepClient } from "./step-client";
import { StepMeasures } from "./step-measures";
import { StepProducts } from "./step-products";

function Stepper({ step, maxReached, onGo }: { step: number; maxReached: number; onGo: (i: number) => void }) {
  const t = useTranslations("wizard");
  return (
    <ol className="flex items-center gap-2" aria-label={t("stepOf", { current: step + 1, total: STEPS.length })}>
      {STEPS.map((key, i) => {
        const done = i < step;
        const current = i === step;
        const reachable = i <= maxReached && i !== step;
        return (
          <li key={key} className="flex flex-1 items-center gap-2 last:flex-none sm:last:flex-1">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onGo(i)}
              aria-current={current ? "step" : undefined}
              className={cn("flex items-center gap-2 rounded-full pr-1 text-left disabled:cursor-default", reachable && "hover:opacity-80")}
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold transition-colors",
                  current && "border-primary bg-primary text-primary-foreground",
                  done && "border-primary bg-accent text-primary",
                  !current && !done && "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
              </span>
              <span className={cn("text-sm font-medium", current ? "text-foreground" : "hidden text-muted-foreground sm:inline")}>{t(`steps.${key}`)}</span>
            </button>
            {i < STEPS.length - 1 && <span className={cn("h-0.5 flex-1 rounded-full", i < step ? "bg-primary" : "bg-border")} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

interface Created {
  orderId: string;
  displayNumber: string;
  clientName: string;
  storeName: string;
  total: number;
  paid: number;
  reste: number;
  photo: "none" | "uploading" | "done" | "failed";
}

function SuccessScreen({ created, onAnother }: { created: Created; onAnother: () => void }) {
  const t = useTranslations("wizard");
  const f = useFormat();
  // A secretary is asked right away to tell the optician (she can skip it); the button stays.
  const tn = useTranslations("notifyAdmin");
  const isSecretary = useShell().user.role !== "super_admin";
  const [notifyOpen, setNotifyOpen] = useState(isSecretary);
  const notifyOrder = { displayNumber: created.displayNumber, clientName: created.clientName, storeName: created.storeName, total: created.total, paid: created.paid, balance: created.reste };
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-10 text-center sm:py-16" role="status" aria-live="polite" data-testid="order-created">
      <svg viewBox="0 0 52 52" className="size-24 text-success" aria-hidden="true">
        <circle cx="26" cy="26" r="24" className="fill-success/12" />
        <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="2.5" className="motion-safe:animate-pop-in" />
        <path d="M15 27l7 7 15-16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="48" className="motion-safe:animate-draw-check" />
      </svg>
      <h1 className="mt-6 text-2xl font-semibold">{t("successTitle")}</h1>
      <p className="num mt-3 text-3xl font-bold tracking-tight text-primary sm:text-4xl motion-safe:animate-rise">{t("successNumber", { number: created.displayNumber, location: created.storeName })}</p>
      <p className="mt-3 text-muted-foreground">{t("successBody", { client: created.clientName, reste: f.money(created.reste) })}</p>
      {created.photo !== "none" && (
        <p className={cn("mt-3 flex items-center gap-2 text-sm", created.photo === "failed" ? "text-destructive" : "text-muted-foreground")}>
          {created.photo === "uploading" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {created.photo === "failed" && <AlertTriangle className="size-4" aria-hidden="true" />}
          {created.photo === "done" && <Check className="size-4 text-success-text" aria-hidden="true" />}
          {t(`photoStatus.${created.photo as Exclude<Created["photo"], "none">}`)}
        </p>
      )}
      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Button size="lg" onClick={onAnother}>
          <Plus />
          {t("another")}
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href={`/orders/${created.orderId}`}>{t("viewOrder")}</Link>
        </Button>
      </div>
      {isSecretary && (
        <>
          <Button variant="ghost" className="mt-3" onClick={() => setNotifyOpen(true)} data-testid="notify-admin-open">
            <WhatsAppIcon className="text-whatsapp-text" />
            {tn("button")}
          </Button>
          <NotifyAdminDialog open={notifyOpen} onOpenChange={setNotifyOpen} step="confirmed" order={notifyOrder} />
        </>
      )}
    </div>
  );
}

/** Which step holds the field an error refers to. */
const STEP_OF_ERROR: Partial<Record<ErrorCode, number>> = {
  phoneExists: 0,
  duplicateSlip: 0,
  forbidden: 0,
  requiredFieldMissing: 1,
  invalidPrescription: 1,
  noStock: 2,
  totalBelowItems: 2,
  discountTooHigh: 2,
  amountTooHigh: 2,
  frameRule: 2,
};

function Wizard() {
  const t = useTranslations();
  const f = useFormat();
  const ctx = useNewOrder();
  const { data, photo, setPhoto, setClient, setSlip } = ctx;
  const schema = useMemo(() => buildOrderSchema((key, values) => t(key as Parameters<typeof t>[0], values as never), { data }), [t, data]);
  const form = useForm<OrderFormValues>({ resolver: zodResolver(schema), defaultValues: defaultValues(data), mode: "onSubmit" });
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [duplicate, setDuplicate] = useState<{ orderId: string; display: string; client: string; date: string } | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const v = useWatch({ control: form.control }) as OrderFormValues;
  const discount = discountAmount(v.total, v.pendingDiscount, v.clientMode === "existing" && v.applyDiscount);
  const reste = Math.max(0, (v.total ?? 0) - discount - (v.deposit ?? 0));

  const goTo = (i: number) => {
    setStep(i);
    setMaxReached((m) => Math.max(m, i));
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const next = async () => {
    const ok = await form.trigger(stepFields(step, data) as FieldPath<OrderFormValues>[], { shouldFocus: true });
    if (!ok) {
      toast.error(t("wizard.fixErrors"));
      return;
    }
    goTo(step + 1);
  };

  const submit = () =>
    form.handleSubmit(
      async (values) => {
        const result = await createOrder(toPayload(values, data));
        if (!result.ok) {
          if ("duplicate" in result) {
            setDuplicate(result.duplicate);
            return;
          }
          toast.error(t(`errors.${result.error}`));
          const target = STEP_OF_ERROR[result.error];
          if (target !== undefined && target !== step) goTo(target);
          return;
        }
        const store = data.stores.find((s) => s.id === values.storeId);
        const base: Created = {
          orderId: result.orderId,
          displayNumber: result.displayNumber,
          clientName: values.clientMode === "existing" ? (ctx.client?.full_name ?? "") : values.newClient.fullName.trim(),
          storeName: store?.name ?? "",
          total: Math.max(0, (values.total ?? 0) - discount),
          paid: values.deposit ?? 0,
          reste,
          photo: photo ? "uploading" : "none",
        };
        setCreated(base);
        window.scrollTo({ top: 0, behavior: "smooth" });
        if (photo) {
          const uploaded = await uploadPrescriptionPhoto(result.orderId, photo);
          setCreated({ ...base, photo: uploaded ? "done" : "failed" });
        }
      },
      (errors) => {
        const firstStep = STEP_FIELDS.findIndex((fields) => fields.some((name) => name.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], errors)));
        if (firstStep >= 0 && firstStep !== step) goTo(firstStep);
        toast.error(t("wizard.fixErrors"));
      },
    )();

  if (created) {
    return (
      <SuccessScreen
        created={created}
        onAnother={() => {
          form.reset({ ...defaultValues(data), clientId: undefined, pendingDiscount: null, applyDiscount: false });
          setClient(null);
          setSlip(null);
          setPhoto(null);
          setCreated(null);
          setStep(0);
          setMaxReached(0);
        }}
      />
    );
  }

  const isLast = step === STEPS.length - 1;
  const { isSubmitting } = form.formState;
  const primaryLabel = isLast ? (isSubmitting ? t("wizard.validating") : t("wizard.validate")) : t("common.next");

  return (
    <FormProvider {...form}>
      <div ref={topRef} className="scroll-mt-20" />
      <PageHeader title={t("wizard.title")} description={t("wizard.stepOf", { current: step + 1, total: STEPS.length })} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isLast) void submit();
          else void next();
        }}
        noValidate
        className="grid grid-cols-1 gap-6 pb-24 md:pb-0 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]"
      >
        <div className="min-w-0 space-y-5">
          <Stepper step={step} maxReached={maxReached} onGo={goTo} />
          <Card>
            <CardContent className="py-1">
              <h2 className="mb-5 text-lg font-semibold">{t(`wizard.steps.${STEPS[step]}`)}</h2>
              <div key={step} className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-2 motion-safe:duration-200">
                {step === 0 && <StepClient />}
                {step === 1 && <StepMeasures />}
                {step === 2 && <StepProducts />}
              </div>
            </CardContent>
          </Card>
          <div className="hidden items-center justify-between md:flex lg:hidden">
            <Button type="button" variant="outline" size="lg" disabled={step === 0} onClick={() => goTo(step - 1)}>
              <ArrowLeft />
              {t("common.previous")}
            </Button>
            <Button type="submit" size="lg" variant={isLast ? "attention" : "default"} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              {primaryLabel}
              {!isLast && <ArrowRight />}
            </Button>
          </div>
        </div>

        <aside className="hidden lg:block">
          <Card className="sticky top-24">
            <CardContent className="space-y-5">
              <h2 className="text-base font-semibold">{t("wizard.summary")}</h2>
              <OrderSummary />
              <div className="flex gap-2 border-t pt-4">
                <Button type="button" variant="outline" size="lg" disabled={step === 0} onClick={() => goTo(step - 1)} aria-label={t("common.previous")}>
                  <ArrowLeft />
                </Button>
                <Button type="submit" size="lg" className="flex-1" variant={isLast ? "attention" : "default"} disabled={isSubmitting} data-testid="wizard-next">
                  {isSubmitting && <Loader2 className="animate-spin" />}
                  {primaryLabel}
                  {!isLast && <ArrowRight />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </aside>

        {/* Phones: sticky action bar + summary in a bottom sheet. */}
        <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
          <button type="button" onClick={() => setSummaryOpen(true)} className="flex w-full items-center justify-between px-4 pt-2 text-sm" aria-haspopup="dialog">
            <span className="flex items-center gap-1 text-muted-foreground">
              <ChevronUp className="size-4" aria-hidden="true" />
              {t("wizard.summary")}
            </span>
            <span className={cn("num font-semibold", reste > 0 ? "text-attention-text" : "text-success-text")}>{t("money.resteShort", { amount: f.money(reste) })}</span>
          </button>
          <div className="flex gap-2 px-4 py-2">
            <Button type="button" variant="outline" size="lg" disabled={step === 0} onClick={() => goTo(step - 1)} aria-label={t("common.previous")}>
              <ArrowLeft />
            </Button>
            <Button type="submit" size="lg" className="flex-1" variant={isLast ? "attention" : "default"} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              {primaryLabel}
              {!isLast && <ArrowRight />}
            </Button>
          </div>
        </div>
      </form>

      <Sheet open={summaryOpen} onOpenChange={setSummaryOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-2xl" closeLabel={t("common.close")}>
          <SheetHeader>
            <SheetTitle>{t("wizard.summary")}</SheetTitle>
            <SheetDescription className="sr-only">{t("wizard.summary")}</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-4 pb-8">
            <OrderSummary />
          </div>
        </SheetContent>
      </Sheet>

      <ResponsiveDialog
        open={!!duplicate}
        onOpenChange={(o) => !o && setDuplicate(null)}
        title={t("wizard.duplicateTitle")}
        footer={
          <>
            <Button variant="outline" onClick={() => setDuplicate(null)}>
              {t("wizard.duplicateFix")}
            </Button>
            {duplicate && (
              <Button asChild>
                <Link href={`/orders/${duplicate.orderId}`}>{t("wizard.openOrder")}</Link>
              </Button>
            )}
          </>
        }
      >
        {duplicate && (
          <div className="space-y-3 text-sm">
            <p>{t("wizard.duplicateBody", { number: duplicate.display, client: duplicate.client, date: f.date(duplicate.date) })}</p>
            <p className="text-muted-foreground">{t("wizard.duplicateNotified")}</p>
          </div>
        )}
      </ResponsiveDialog>
    </FormProvider>
  );
}

export function NewOrderWizard({ data }: { data: NewOrderData }) {
  return (
    <NewOrderProvider data={data}>
      <Wizard />
    </NewOrderProvider>
  );
}
