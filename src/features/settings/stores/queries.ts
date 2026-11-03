import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface StoreRow {
  id: string;
  name: string;
  kind: "store" | "lab";
  prefix: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  orders: number;
  secretaries: number;
}

/** Stores and lab, active ones first (super admin sees inactive ones too). */
export async function getStores(): Promise<StoreRow[]> {
  const db = await createClient();
  const [stores, usage] = await Promise.all([
    db.from("stores").select("id, name, kind, prefix, address, phone, is_active").order("is_active", { ascending: false }).order("kind").order("name"),
    db.from("store_usage").select("store_id, orders, secretaries"),
  ]);
  if (stores.error) throw new Error("stores failed");
  const counts = new Map((usage.data ?? []).map((u) => [u.store_id, u]));
  return stores.data.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    prefix: s.prefix,
    address: s.address,
    phone: s.phone,
    isActive: s.is_active,
    orders: counts.get(s.id)?.orders ?? 0,
    secretaries: counts.get(s.id)?.secretaries ?? 0,
  }));
}
