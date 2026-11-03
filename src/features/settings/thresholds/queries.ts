import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { StuckDays } from "./schemas";

export interface LoyaltyData {
  threshold: number;
  loyalClients: number;
  /** delivered orders → number of clients */
  distribution: { delivered: number; clients: number }[];
}

export async function getLoyaltyData(): Promise<LoyaltyData> {
  const db = await createClient();
  const [setting, loyal, counts] = await Promise.all([
    db.from("app_settings").select("value").eq("key", "loyalty_threshold").maybeSingle(),
    db.from("clients").select("id", { count: "exact", head: true }).eq("is_loyal", true),
    db.from("client_delivery_counts").select("delivered, clients"),
  ]);
  return {
    threshold: (setting.data?.value as { orders?: number } | null)?.orders ?? 5,
    loyalClients: loyal.count ?? 0,
    distribution: (counts.data ?? []).map((c) => ({ delivered: c.delivered ?? 0, clients: c.clients ?? 0 })),
  };
}

const DEFAULT_DAYS: StuckDays = { confirmed: 3, in_workshop: 5, prepared: 3, in_store: 10 };

export async function getStuckDays(): Promise<StuckDays> {
  const db = await createClient();
  const { data } = await db.from("app_settings").select("value").eq("key", "stuck_order_days").maybeSingle();
  return { ...DEFAULT_DAYS, ...((data?.value as Partial<StuckDays> | null) ?? {}) };
}
