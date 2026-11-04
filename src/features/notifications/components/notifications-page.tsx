"use client";

import { CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { markAllRead } from "../actions";
import type { NotificationRow } from "../render";
import { NotificationItem } from "./notification-item";
import { useNotifications } from "./notifications-provider";

/** Every notification of the user, unread first (SPEC §10). Both roles. */
export function NotificationsPage({ items, unreadOnly }: { items: NotificationRow[]; unreadOnly: boolean }) {
  const t = useTranslations("notifications");
  const tp = useTranslations("pages.notifications");
  const router = useRouter();
  const pathname = usePathname();
  const { unread, setUnread } = useNotifications();
  const [busy, startTransition] = useTransition();

  const filter = (value: string) => startTransition(() => router.replace({ pathname, query: value === "unread" ? { filter: "unread" } : {} }, { scroll: false }));

  return (
    <>
      <PageHeader
        title={tp("title")}
        description={tp("description")}
        actions={
          unread > 0 && (
            <Button
              variant="outline"
              onClick={async () => {
                setUnread(0);
                await markAllRead();
                startTransition(() => router.refresh());
              }}
            >
              <CheckCheck />
              {t("markAllRead")}
            </Button>
          )
        }
      />
      <ChoiceChips
        label={t("filter")}
        className="mb-5"
        value={unreadOnly ? "unread" : "all"}
        onChange={(v) => v && filter(v)}
        options={[
          { value: "all", label: t("all") },
          { value: "unread", label: `${t("unread")} · ${unread}` },
        ]}
      />
      <Card className={cn("p-2 transition-opacity", busy && "opacity-60")}>
        {items.length === 0 ? (
          <EmptyState illustration="bell" title={unreadOnly ? t("emptyUnread") : t("empty")} body={unreadOnly ? undefined : t("emptyBody")} className="py-10" />
        ) : (
          <ul className="space-y-1" data-testid="notifications-list">
            {items.map((n) => (
              <li key={n.id}>
                <NotificationItem n={n} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
