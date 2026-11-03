"use client";

import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link } from "@/i18n/navigation";

/** Unread count and latest items arrive with Realtime in phase 12. */
export function NotificationBell() {
  const t = useTranslations("notifications");
  const [open, setOpen] = useState(false);
  const unread = 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full" aria-label={t("bellLabel", { count: unread })}>
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="num absolute top-1 right-1 min-w-[18px] rounded-full bg-attention-strong px-1 text-center text-[10px] leading-[18px] font-bold text-attention-strong-foreground ring-2 ring-background motion-safe:animate-pop-in">
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
        </div>
        <div className="max-h-[60dvh] overflow-y-auto p-2">
          <EmptyState illustration="bell" title={t("empty")} body={t("emptyBody")} className="py-8" />
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
