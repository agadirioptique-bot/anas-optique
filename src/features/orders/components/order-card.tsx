"use client";

import { ArrowRight, Clock, Glasses } from "lucide-react";
import { useTranslations } from "next-intl";
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { ResteBadge, StatusBadge, WhatsAppIcon } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";
import type { OrderRow } from "../queries";
import { nextStatus } from "./order-actions";

export interface OrderCardProps extends HTMLAttributes<HTMLDivElement> {
  row: OrderRow;
  /** Days in the current status before the card turns red (Settings › Notifications). */
  lateAfter?: number;
  showStore?: boolean;
  showStatus?: boolean;
  onAdvance?: () => void;
  dragging?: boolean;
  /** Board only: the drag handle (keyboard drag lives there, so the card holds no nested controls). */
  handle?: ReactNode;
}

/** Board card (demo): number, client, total, balance badge, days in status, WhatsApp, next step on phones. */
export const OrderCard = forwardRef<HTMLDivElement, OrderCardProps>(function OrderCard(
  { row, lateAfter, showStore, showStatus, onAdvance, dragging, handle, className, ...rest },
  ref,
) {
  const t = useTranslations();
  const f = useFormat();
  const days = f.daysSince(row.statusSince);
  const active = row.status !== "delivered" && row.status !== "cancelled";
  const late = active && lateAfter !== undefined && days > lateAfter;
  const next = nextStatus(row.status);

  return (
    <div
      ref={ref}
      {...rest}
      data-testid={`order-card-${row.displayNumber}`}
      className={cn("group relative rounded-xl border bg-card p-3 shadow-soft transition-shadow", dragging && "rotate-1 shadow-lift ring-2 ring-primary", className)}
    >
      <div className="flex items-center gap-2">
        <Link
          href={`/orders/${row.id}`}
          className="num text-sm font-semibold text-primary after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          draggable={false}
        >
          {row.displayNumber}
        </Link>
        {showStore && <span className="truncate rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{row.storeName}</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {row.ownFrame && <Glasses className="size-4 text-muted-foreground" aria-label={t("detail.clientFrame")} />}
          {row.clientHasWhatsapp && <WhatsAppIcon className="size-4 text-whatsapp" />}
          {handle}
        </span>
      </div>
      <p className="mt-1.5 truncate font-medium">{row.clientName || "—"}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="num text-sm text-muted-foreground">{f.money(row.total)}</span>
        {row.status !== "cancelled" && <ResteBadge reste={row.balance} />}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {showStatus ? (
          <StatusBadge status={row.status} />
        ) : (
          <span className={cn("flex items-center gap-1 text-xs", late ? "font-semibold text-destructive" : "text-muted-foreground")}>
            <Clock className="size-3.5" aria-hidden="true" />
            {t("orders.daysInStatus", { count: days })}
            {late && <span className="sr-only">({t("orders.late")})</span>}
          </span>
        )}
      </div>
      {next && onAdvance && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="relative z-10 mt-3 w-full justify-between md:hidden"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAdvance();
          }}
        >
          {t(`statusNext.${next}`)}
          <ArrowRight />
        </Button>
      )}
    </div>
  );
});
