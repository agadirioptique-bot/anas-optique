import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { NotificationRow } from "./render";

const COLUMNS = "id, kind, params, link, read_at, created_at";

export function toNotificationRow(r: { id: string; kind: string; params: unknown; link: string | null; read_at: string | null; created_at: string }): NotificationRow {
  return {
    id: r.id,
    kind: r.kind,
    params: (r.params as Record<string, unknown> | null) ?? {},
    link: r.link,
    readAt: r.read_at,
    createdAt: r.created_at,
  };
}

/** The caller's notifications (RLS: own rows only), unread first then newest. */
export async function getNotifications({ unreadOnly = false, limit = 100 }: { unreadOnly?: boolean; limit?: number } = {}): Promise<NotificationRow[]> {
  const db = await createClient();
  let query = db.from("notifications").select(COLUMNS);
  if (unreadOnly) query = query.is("read_at", null);
  const { data, error } = await query.order("read_at", { ascending: false, nullsFirst: true }).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error("notifications failed");
  return data.map(toNotificationRow);
}

/** Newest first, for the bell dropdown. */
export async function getLatestNotifications(limit = 8): Promise<NotificationRow[]> {
  const db = await createClient();
  const { data, error } = await db.from("notifications").select(COLUMNS).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error("notifications failed");
  return data.map(toNotificationRow);
}

export async function getUnreadCount(): Promise<number> {
  const db = await createClient();
  const { count } = await db.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
}
