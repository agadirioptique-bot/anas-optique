"use client";

import { useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { markRead } from "../actions";
import { notificationView, type NotificationRow } from "../render";

interface NotificationsValue {
  /** Live unread count (server value, then Realtime). */
  unread: number;
  setUnread: (n: number) => void;
  /** Bumps when a notification arrives, so an open dropdown can reload. */
  version: number;
  /** Text and link of a notification in the user's language. */
  view: (n: NotificationRow) => ReturnType<typeof notificationView>;
  /** Marks it read, then opens its link. */
  open: (n: NotificationRow) => Promise<void>;
}

const Ctx = createContext<NotificationsValue | null>(null);

export function useNotifications(): NotificationsValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useNotifications must be used inside <NotificationsProvider>");
  return v;
}

/**
 * One Realtime subscription per signed-in user (SPEC §10): postgres_changes on their own
 * notifications rows (RLS applies). Shared by the top-bar bell and the phone bottom bar.
 */
export function NotificationsProvider({ userId, initialUnread, children }: { userId: string; initialUnread: number; children: ReactNode }) {
  const t = useTranslations("notifications");
  const tk = useTranslations("notifications.kinds");
  const ts = useTranslations("status");
  const router = useRouter();
  const [unread, setUnread] = useState(initialUnread);
  const [version, setVersion] = useState(0);
  const [synced, setSynced] = useState(initialUnread);

  // A server refresh (router.refresh) brings the authoritative count.
  if (initialUnread !== synced) {
    setSynced(initialUnread);
    setUnread(initialUnread);
  }

  const view = (n: NotificationRow) =>
    notificationView(
      n,
      (key, values) => tk(key as never, values as never),
      (status) => ts(status as never),
      new Date(),
    );

  const open = async (n: NotificationRow) => {
    if (!n.readAt) {
      setUnread((c) => Math.max(0, c - 1));
      const result = await markRead({ ids: [n.id] });
      if (result.ok) setUnread(result.data.unread);
    }
    router.push(view(n).href);
  };

  // The Realtime callbacks are created once; read the latest helpers through a ref.
  const latest = useRef({ view, open, label: t("open") });
  useEffect(() => {
    latest.current = { view, open, label: t("open") };
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`notifications:${userId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
          const r = payload.new as { id: string; kind: string; params: unknown; link: string | null; read_at: string | null; created_at: string };
          const row: NotificationRow = { id: r.id, kind: r.kind, params: (r.params as Record<string, unknown>) ?? {}, link: r.link, readAt: r.read_at, createdAt: r.created_at };
          setUnread((c) => c + 1);
          setVersion((v) => v + 1);
          const v = latest.current.view(row);
          toast(v.title, { description: v.body, action: { label: latest.current.label, onClick: () => void latest.current.open(row) } });
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
          // Read elsewhere (another tab or device): the server value comes with the next refresh.
          setVersion((v) => v + 1);
        })
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId]);

  return <Ctx.Provider value={{ unread, setUnread, version, view, open }}>{children}</Ctx.Provider>;
}
