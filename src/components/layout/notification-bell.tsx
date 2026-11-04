"use client";

import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { loadLatest, markAllRead } from "@/features/notifications/actions";
import { NotificationItem } from "@/features/notifications/components/notification-item";
import { useNotifications } from "@/features/notifications/components/notifications-provider";
import type { NotificationRow } from "@/features/notifications/render";
import { Link, useRouter } from "@/i18n/navigation";

/** Bell with the live unread count (Realtime) and the latest notifications (SPEC §10). */
export function NotificationBell() {
  const t = useTranslations("notifications");
  const router = useRouter();
  const { unread, setUnread, version } = useNotifications();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[] | null>(null);

  // Load when opened, and again when a notification arrives while it is open.
  useEffect(() => {
    if (!open) return;
    let live = true;
    void loadLatest().then((r) => {
      if (!live || !r.ok) return;
      setItems(r.data.items);
      setUnread(r.data.unread);
    });
    return () => {
      live = false;
    };
  }, [open, version, setUnread]);

  const readAll = async () => {
    setItems((list) => list?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null);
    setUnread(0);
    await markAllRead();
    router.refresh();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full" aria-label={t("bellLabel", { count: unread })} data-testid="notification-bell">
          <Bell className="size-5" />
          {unread > 0 && (
            <span
              className="num absolute top-1 right-1 min-w-[18px] rounded-full bg-attention-strong px-1 text-center text-[10px] leading-[18px] font-bold text-attention-strong-foreground ring-2 ring-background motion-safe:animate-pop-in"
              data-testid="notification-count"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[400px] max-w-[calc(100vw-1.5rem)] rounded-2xl p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <p className="font-semibold">{t("title")}</p>
            <p className="text-xs text-muted-foreground">{t("newCount", { count: unread })}</p>
          </div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={() => void readAll()}>
              <CheckCheck />
              {t("markAllRead")}
            </Button>
          )}
        </div>
        <div className="max-h-[60dvh] overflow-y-auto p-2">
          {items === null ? (
            <div className="grid place-items-center py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState illustration="bell" title={t("empty")} body={t("emptyBody")} className="py-8" />
          ) : (
            <ul className="space-y-1">
              {items.map((n) => (
                <li key={n.id}>
                  <NotificationItem n={n} onOpen={() => setOpen(false)} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t p-2">
          <Button asChild variant="ghost" className="w-full" onClick={() => setOpen(false)}>
            <Link href="/notifications">{t("seeAll")} →</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
