"use client";

import { Bell, CalendarClock, Copy, PackageMinus, Star, Timer, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";
import type { NotificationKind, NotificationRow } from "../render";
import { useNotifications } from "./notifications-provider";

const ICONS: Record<NotificationKind, typeof Bell> = {
  client_became_loyal: Star,
  clients_became_loyal: Users,
  low_stock: PackageMinus,
  order_stuck: Timer,
  duplicate_slip_blocked: Copy,
  recurring_charges_pending: CalendarClock,
  unknown: Bell,
};

const TONES: Partial<Record<NotificationKind, string>> = {
  low_stock: "bg-destructive/10 text-destructive",
  order_stuck: "bg-destructive/10 text-destructive",
  duplicate_slip_blocked: "bg-attention/10 text-attention-text",
  recurring_charges_pending: "bg-attention/10 text-attention-text",
  client_became_loyal: "bg-success/10 text-success-text",
  clients_became_loyal: "bg-success/10 text-success-text",
};

/** One notification: icon, title, text, time; clicking marks it read and opens its link. */
export function NotificationItem({ n, onOpen }: { n: NotificationRow; onOpen?: () => void }) {
  const t = useTranslations("notifications");
  const f = useFormat();
  const { view, open } = useNotifications();
  const v = view(n);
  const Icon = ICONS[v.kind];
  return (
    <button
      type="button"
      onClick={() => {
        onOpen?.();
        void open(n);
      }}
      className={cn("flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted/70", !n.readAt && "bg-accent/40")}
      data-testid="notification-item"
      data-kind={v.kind}
    >
      <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", TONES[v.kind] ?? "bg-muted text-muted-foreground")}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn("truncate text-sm", !n.readAt ? "font-semibold" : "font-medium")}>{v.title}</span>
          {!n.readAt && (
            <span className="size-2 shrink-0 rounded-full bg-attention" title={t("unreadDot")}>
              <span className="sr-only">{t("unreadDot")}</span>
            </span>
          )}
        </span>
        {v.body && <span className="block text-sm text-muted-foreground">{v.body}</span>}
        <span className="num mt-0.5 block text-xs text-muted-foreground">{f.dateTime(n.createdAt)}</span>
      </span>
    </button>
  );
}
