import { useTranslations } from "next-intl";
import type { OrderStatus } from "@/lib/orders";
import { cn } from "@/lib/utils";

/** One colour per status, used everywhere (badges, board columns, charts) — from the demo. */
export const STATUS_BADGE: Record<OrderStatus, string> = {
  confirmed: "bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/20",
  in_workshop: "bg-violet-50 text-violet-700 ring-violet-600/15 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/20",
  prepared: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/20",
  in_store: "bg-teal-50 text-teal-700 ring-teal-600/15 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-400/20",
  delivered: "bg-green-50 text-green-700 ring-green-600/15 dark:bg-green-500/15 dark:text-green-300 dark:ring-green-400/20",
  cancelled: "bg-slate-100 text-red-700 ring-slate-500/20 dark:bg-slate-500/15 dark:text-red-300 dark:ring-slate-400/20",
};

export const STATUS_DOT: Record<OrderStatus, string> = {
  confirmed: "bg-status-confirmed",
  in_workshop: "bg-status-workshop",
  prepared: "bg-status-prepared",
  in_store: "bg-status-in_store",
  delivered: "bg-status-delivered",
  cancelled: "bg-status-cancelled",
};

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const t = useTranslations("status");
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        STATUS_BADGE[status],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} aria-hidden="true" />
      {t(status)}
    </span>
  );
}
