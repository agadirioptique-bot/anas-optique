"use client";

import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ConfirmDialog, ResponsiveDialog } from "@/components/shared/dialogs";
import { MoneyInput } from "@/components/shared/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/errors";
import { localized } from "@/lib/localized";
import { ORDER_FLOW, type OrderStatus } from "@/lib/orders";
import { formatPhone } from "@/lib/phone";
import { useFormat } from "@/lib/use-format";
import { addOrderPayment, applyFreeDiscount, cancelOrder, changeOrderStatus, deliverOrder } from "../actions";
import type { Labeled } from "../new/data";
import type { AdminNotifyStep } from "../notify";
import type { OrderRow } from "../queries";
import { useReadyWhatsAppHref } from "../use-whatsapp";
import { NotifyAdminDialog } from "./notify-admin";

type FlowStatus = (typeof ORDER_FLOW)[number];

export function nextStatus(status: OrderStatus): FlowStatus | null {
  const i = ORDER_FLOW.indexOf(status as (typeof ORDER_FLOW)[number]);
  return i >= 0 && i < ORDER_FLOW.length - 1 ? ORDER_FLOW[i + 1] : null;
}

export function previousStatus(status: OrderStatus): FlowStatus | null {
  const i = ORDER_FLOW.indexOf(status as (typeof ORDER_FLOW)[number]);
  return i > 0 && status !== "delivered" ? ORDER_FLOW[i - 1] : null;
}

interface OrderActions {
  isSuperAdmin: boolean;
  /** Next step; delivery with a balance due opens the collect dialog. Resolves when done. */
  advance: (row: OrderRow) => Promise<boolean>;
  stepBack: (row: OrderRow) => void;
  collect: (row: OrderRow, opts?: { deliver?: boolean }) => void;
  cancel: (row: OrderRow) => void;
  /** max = what the discount may reach: the balance, and never below the frame + products price. */
  discount: (row: OrderRow, max: number) => void;
}

const Ctx = createContext<OrderActions | null>(null);

export function useOrderActions(): OrderActions {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOrderActions must be used inside <OrderActionsProvider>");
  return v;
}

function useRun() {
  const t = useTranslations("errors");
  const router = useRouter();
  return useCallback(
    async (action: () => Promise<ActionResult>, onSuccess?: () => void): Promise<boolean> => {
      const result = await action();
      if (!result.ok) {
        toast.error(t(result.error));
        router.refresh();
        return false;
      }
      onSuccess?.();
      router.refresh();
      return true;
    },
    [t, router],
  );
}

function MethodPicker({ methods, value, onChange }: { methods: Labeled[]; value: string; onChange: (v: string) => void }) {
  const locale = useLocale();
  return (
    <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v)} variant="outline" className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4" spacing={2}>
      {methods.map((m) => (
        <ToggleGroupItem key={m.id} value={m.id} className="h-11 rounded-lg! data-[state=on]:border-primary data-[state=on]:bg-accent data-[state=on]:text-accent-foreground">
          {localized(m, locale)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** The order as it stands once delivered: fully paid (delivery needs a zero balance), `paidToday` collected at the delivery. */
function deliveredRow(row: OrderRow, paidToday: number): OrderRow & { paidToday: number } {
  return { ...row, status: "delivered", paid: row.total, balance: 0, paidToday };
}

function CollectDialog({
  row,
  deliver,
  methods,
  onClose,
  onDelivered,
}: {
  row: OrderRow;
  deliver: boolean;
  methods: Labeled[];
  onClose: () => void;
  /** Called instead of onClose once the order is delivered (opens the secretary's WhatsApp prompt). */
  onDelivered?: (row: OrderRow & { paidToday: number }) => void;
}) {
  const t = useTranslations();
  const f = useFormat();
  const run = useRun();
  const [amount, setAmount] = useState<number | undefined>(row.balance);
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [touched, setTouched] = useState(false);
  const reste = row.balance;
  const error =
    amount === undefined || !(amount > 0)
      ? t("collect.invalidAmount")
      : amount > reste
        ? t("collect.tooMuch", { amount: f.money(reste) })
        : deliver && amount < reste
          ? t("collect.mustBeFull", { amount: f.money(reste) })
          : null;

  const submit = async () => {
    setTouched(true);
    if (error || amount === undefined) return;
    setPending(true);
    const done = await run(
      () => (deliver ? deliverOrder({ orderId: row.id, payment: { amount, methodId } }) : addOrderPayment({ orderId: row.id, amount, methodId })),
      () =>
        deliver
          ? toast.success(t("collect.delivered", { number: row.displayNumber }), { description: t("collect.done", { amount: f.money(amount) }) })
          : toast.success(t("collect.done", { amount: f.money(amount) })),
    );
    setPending(false);
    if (!done) return;
    if (deliver && onDelivered) onDelivered(deliveredRow(row, amount));
    else onClose();
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      title={deliver ? t("collect.title") : t("collect.titlePayment")}
      description={t("collect.description", { number: row.displayNumber, client: row.clientName })}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button variant={deliver ? "success" : "default"} onClick={submit} disabled={pending} data-testid="collect-confirm">
            {pending && <Loader2 className="animate-spin" />}
            {deliver ? t("collect.confirmDeliver") : t("collect.confirm")}
          </Button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {deliver && <p className="rounded-xl bg-attention/10 px-4 py-3 text-sm text-attention-text">{t("collect.deliverHint")}</p>}
        <div className="flex items-baseline justify-between rounded-xl bg-muted/60 px-4 py-3">
          <span className="text-sm text-muted-foreground">{t("money.reste")}</span>
          <span className="num text-xl font-semibold text-attention-text">{f.money(reste)}</span>
        </div>
        <div className="space-y-2">
          <Label htmlFor="collect-amount">{t("collect.amount")}</Label>
          <MoneyInput id="collect-amount" size="lg" value={amount} onChange={setAmount} invalid={touched && !!error} aria-describedby="collect-error" />
          {touched && error ? (
            <p id="collect-error" className="text-sm text-destructive">
              {error}
            </p>
          ) : (
            amount !== undefined &&
            amount <= reste && (
              <p id="collect-error" className="text-sm text-muted-foreground">
                {t("collect.remaining", { amount: f.money(reste - amount) })}
              </p>
            )
          )}
        </div>
        <div className="space-y-2">
          <Label>{t("collect.method")}</Label>
          <MethodPicker methods={methods} value={methodId} onChange={setMethodId} />
        </div>
      </form>
    </ResponsiveDialog>
  );
}

function CancelDialog({ row, methods, reasons, onClose }: { row: OrderRow; methods: Labeled[]; reasons: Labeled[]; onClose: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const f = useFormat();
  const run = useRun();
  const [reasonId, setReasonId] = useState(reasons[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [refund, setRefund] = useState<number | undefined>(row.paid > 0 ? row.paid : 0);
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const refundError = refund !== undefined && refund > row.paid ? t("cancel.refundTooHigh", { amount: f.money(row.paid) }) : null;

  const submit = async () => {
    if (!reasonId || refundError) return;
    setPending(true);
    const amount = refund ?? 0;
    const done = await run(
      () => cancelOrder({ orderId: row.id, reasonId, note: note || undefined, refundAmount: amount, refundMethodId: amount > 0 ? methodId : null }),
      () => toast.success(t("cancel.done", { number: row.displayNumber }), { description: amount > 0 ? t("cancel.doneBody", { amount: f.money(amount) }) : undefined }),
    );
    setPending(false);
    if (done) onClose();
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      title={t("cancel.title", { number: row.displayNumber })}
      description={t("cancel.intro")}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("common.back")}
          </Button>
          <Button variant="destructive" className="bg-destructive text-white hover:bg-destructive/90" onClick={submit} disabled={pending || !reasonId || !!refundError}>
            {pending && <Loader2 className="animate-spin" />}
            {t("cancel.confirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{t("cancel.stockBack")}</li>
          <li>{t("cancel.revenue")}</li>
        </ul>
        <div className="space-y-2">
          <Label htmlFor="cancel-reason">{t("cancel.reason")}</Label>
          <Select value={reasonId} onValueChange={setReasonId}>
            <SelectTrigger id="cancel-reason" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {reasons.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {localized(r, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cancel-note">{t("cancel.note")}</Label>
          <Input id="cancel-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {row.paid > 0 && (
          <>
            <div className="space-y-2">
              <Label htmlFor="cancel-refund">{t("cancel.refundAmount", { paid: f.money(row.paid) })}</Label>
              <MoneyInput id="cancel-refund" value={refund} onChange={setRefund} invalid={!!refundError} />
              {refundError && <p className="text-sm text-destructive">{refundError}</p>}
            </div>
            {(refund ?? 0) > 0 && (
              <div className="space-y-2">
                <Label>{t("cancel.refundMethod")}</Label>
                <MethodPicker methods={methods} value={methodId} onChange={setMethodId} />
              </div>
            )}
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}

function DiscountDialog({ row, max, onClose }: { row: OrderRow; max: number; onClose: () => void }) {
  const t = useTranslations();
  const f = useFormat();
  const run = useRun();
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [pending, setPending] = useState(false);
  // The server checks both rules too (AMOUNT_TOO_HIGH, DISCOUNT_TOO_HIGH); say which one limits.
  const error =
    amount !== undefined && amount > max
      ? max < row.balance
        ? t("discount.tooHighProducts", { amount: f.money(max) })
        : t("discount.tooHigh", { amount: f.money(row.balance) })
      : null;
  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      title={t("discount.title", { number: row.displayNumber })}
      description={t("discount.description")}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={pending || !amount || !!error}
            onClick={async () => {
              if (!amount) return;
              setPending(true);
              const done = await run(() => applyFreeDiscount({ orderId: row.id, amount }), () => toast.success(t("discount.done", { amount: f.money(amount) })));
              setPending(false);
              if (done) onClose();
            }}
          >
            {pending && <Loader2 className="animate-spin" />}
            {t("discount.confirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="free-discount">{t("discount.amount")}</Label>
        <MoneyInput id="free-discount" size="lg" value={amount} onChange={setAmount} invalid={!!error} />
        {error ? <p className="text-sm text-destructive">{error}</p> : <p className="text-sm text-muted-foreground">{t("discount.hint", { amount: f.money(max) })}</p>}
      </div>
    </ResponsiveDialog>
  );
}

type Dialog =
  | { kind: "collect"; row: OrderRow; deliver: boolean }
  | { kind: "cancel"; row: OrderRow }
  | { kind: "discount"; row: OrderRow; max: number }
  | { kind: "back"; row: OrderRow }
  | { kind: "notify"; step: AdminNotifyStep; row: OrderRow & { paidToday?: number } };

export function OrderActionsProvider({
  children,
  isSuperAdmin,
  methods,
  reasons,
}: {
  children: ReactNode;
  isSuperAdmin: boolean;
  methods: Labeled[];
  reasons: Labeled[];
}) {
  const t = useTranslations();
  const run = useRun();
  const readyHref = useReadyWhatsAppHref();
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const advance = useCallback(
    async (row: OrderRow) => {
      const next = nextStatus(row.status);
      if (!next) return false;
      if (next === "delivered") {
        if (row.balance > 0) {
          setDialog({ kind: "collect", row, deliver: true });
          return false;
        }
        return run(
          () => deliverOrder({ orderId: row.id, payment: null }),
          () => {
            toast.success(t("collect.delivered", { number: row.displayNumber }));
            if (!isSuperAdmin) setDialog({ kind: "notify", step: "delivered", row: deliveredRow(row, 0) });
          },
        );
      }
      return run(
        () => changeOrderStatus({ orderId: row.id, to: next }),
        () => {
          if (next !== "in_store") {
            toast.success(t("orders.movedTo", { number: row.displayNumber, status: t(`status.${next}`) }));
            return;
          }
          // A secretary tells the optician the glasses have arrived (she can skip it).
          if (!isSuperAdmin) setDialog({ kind: "notify", step: "in_store", row: { ...row, status: next } });
          const href = readyHref({ ...row, status: next });
          toast.success(t("orders.readyToast", { number: row.displayNumber }), {
            duration: 12000,
            description: href ? t("orders.readyToastBody", { client: row.clientName }) : t("orders.noWhatsapp", { phone: formatPhone(row.clientPhone) }),
            action: href ? { label: t("orders.whatsappNotify"), onClick: () => window.open(href, "_blank", "noopener,noreferrer") } : undefined,
          });
        },
      );
    },
    [run, t, isSuperAdmin, readyHref],
  );

  const value = useMemo<OrderActions>(
    () => ({
      isSuperAdmin,
      advance,
      stepBack: (row) => setDialog({ kind: "back", row }),
      collect: (row, opts) => setDialog({ kind: "collect", row, deliver: !!opts?.deliver }),
      cancel: (row) => setDialog({ kind: "cancel", row }),
      discount: (row, max) => setDialog({ kind: "discount", row, max }),
    }),
    [isSuperAdmin, advance],
  );

  const close = () => setDialog(null);
  const back = dialog?.kind === "back" ? previousStatus(dialog.row.status) : null;

  return (
    <Ctx.Provider value={value}>
      {children}
      {dialog?.kind === "notify" && (
        <NotifyAdminDialog open onOpenChange={(o) => !o && close()} step={dialog.step} order={dialog.row} />
      )}
      {dialog?.kind === "collect" && (
        <CollectDialog
          key={dialog.row.id}
          row={dialog.row}
          deliver={dialog.deliver}
          methods={methods}
          onClose={close}
          // A secretary tells the optician the pair was delivered (she can skip it).
          onDelivered={isSuperAdmin ? undefined : (row) => setDialog({ kind: "notify", step: "delivered", row })}
        />
      )}
      {dialog?.kind === "cancel" && <CancelDialog row={dialog.row} methods={methods} reasons={reasons} onClose={close} />}
      {dialog?.kind === "discount" && <DiscountDialog row={dialog.row} max={dialog.max} onClose={close} />}
      <ConfirmDialog
        open={dialog?.kind === "back" && !!back}
        onOpenChange={(o) => !o && close()}
        destructive={false}
        title={dialog?.kind === "back" && back ? t("orders.stepBackTitle", { number: dialog.row.displayNumber, status: t(`status.${back}`) }) : ""}
        description={t("orders.stepBackBody")}
        confirmLabel={t("orders.stepBack")}
        onConfirm={async () => {
          if (dialog?.kind !== "back" || !back) return;
          const row = dialog.row;
          await run(() => changeOrderStatus({ orderId: row.id, to: back }), () => toast.success(t("orders.movedTo", { number: row.displayNumber, status: t(`status.${back}`) })));
        }}
      />
    </Ctx.Provider>
  );
}
