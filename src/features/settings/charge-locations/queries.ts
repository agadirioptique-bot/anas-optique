import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface ChargeLocationRow {
  id: string;
  labelFr: string;
  labelEn: string;
  /** store | lab (linked to a location), general ('Général'), other (added by the super admin) */
  kind: "store" | "lab" | "general" | "other";
  isArchived: boolean;
}

export async function getChargeLocations(): Promise<ChargeLocationRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("charge_locations")
    .select("id, label_fr, label_en, is_general, is_archived, stores(kind)")
    .order("sort");
  if (error) throw new Error("charge_locations failed");
  return data.map((l) => ({
    id: l.id,
    labelFr: l.label_fr,
    labelEn: l.label_en,
    kind: l.is_general ? "general" : (l.stores?.kind ?? "other"),
    isArchived: l.is_archived,
  }));
}
