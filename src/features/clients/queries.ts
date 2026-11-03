import "server-only";
import type { ClientSegment } from "@/components/shared/badges";
import { createClient } from "@/lib/supabase/server";
import type { ClientSort, SegmentFilter } from "./schemas";

export interface ClientListRow {
  id: string;
  full_name: string;
  phone_e164: string;
  has_whatsapp: boolean;
  is_loyal: boolean;
  has_pending_discount: boolean;
  orders: number;
  last_order_at: string | null;
  segment: ClientSegment;
}

export interface ClientDirectory {
  rows: ClientListRow[];
  counts: Record<SegmentFilter, number>;
}

/** All clients (shared by stores) with cross-store counts — never money (client_directory RPC). */
export async function getClientDirectory(params: { q: string; segment: SegmentFilter; sort: ClientSort; limit: number }): Promise<ClientDirectory> {
  const db = await createClient();
  const { data, error } = await db.rpc("client_directory", {
    p_q: params.q,
    p_segment: params.segment,
    p_sort: params.sort,
    p_limit: params.limit,
    p_offset: 0,
  });
  if (error) throw new Error("client_directory failed");
  return data as unknown as ClientDirectory;
}

export interface ClientStats {
  orders: number;
  delivered: number;
  stores: number;
  first_order_at: string | null;
  last_order_at: string | null;
  /** Super admin only (null for secretaries). */
  spent: number | null;
}

/** Client file: the client, cross-store counts, and the orders the user may see (RLS). */
export async function getClientFile(id: string) {
  const db = await createClient();
  const [client, stats, orders, threshold] = await Promise.all([
    db.from("clients").select("*").eq("id", id).maybeSingle(),
    db.rpc("client_order_stats", { p_client_id: id }),
    db.from("order_overview").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    db.from("app_settings").select("value").eq("key", "loyalty_threshold").maybeSingle(),
  ]);
  if (!client.data) return null;
  return {
    client: client.data,
    stats: stats.data as unknown as ClientStats,
    orders: orders.data ?? [],
    loyaltyThreshold: (threshold.data?.value as { orders?: number } | null)?.orders ?? 5,
  };
}
export type ClientFile = NonNullable<Awaited<ReturnType<typeof getClientFile>>>;
