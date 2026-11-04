"use server";

import { z } from "zod";
import { getSessionUser } from "@/features/auth/session";
import { dbErrorCode, fail, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { getLatestNotifications, getUnreadCount } from "./queries";
import type { NotificationRow } from "./render";

const markSchema = z.object({ ids: z.array(z.uuid()).min(1).max(200) });

/** Marks the caller's notifications read (RLS: own rows only, read_at only). */
export async function markRead(input: unknown): Promise<ActionResult<{ unread: number }>> {
  if (!(await getSessionUser())) return fail("forbidden");
  const p = markSchema.safeParse(input);
  if (!p.success) return fail("invalidInput");
  const { error } = await (await createClient()).rpc("mark_notifications_read", { p_ids: p.data.ids });
  return error ? fail(dbErrorCode(error)) : ok({ unread: await getUnreadCount() });
}

export async function markAllRead(): Promise<ActionResult<{ unread: number }>> {
  if (!(await getSessionUser())) return fail("forbidden");
  const { error } = await (await createClient()).rpc("mark_notifications_read", {});
  return error ? fail(dbErrorCode(error)) : ok({ unread: 0 });
}

/** Bell dropdown: the latest notifications and the live unread count. */
export async function loadLatest(): Promise<ActionResult<{ items: NotificationRow[]; unread: number }>> {
  if (!(await getSessionUser())) return fail("forbidden");
  try {
    const [items, unread] = await Promise.all([getLatestNotifications(), getUnreadCount()]);
    return ok({ items, unread });
  } catch {
    return fail("unexpected");
  }
}
