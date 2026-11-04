"use server";

import { getSessionUser } from "@/features/auth/session";
import type { OrderStatus } from "@/lib/orders";
import { searchInput } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export interface SearchResults {
  clients: { id: string; full_name: string; phone_e164: string; is_loyal: boolean }[];
  orders: { id: string; display_number: string; client_name: string; status: OrderStatus; created_at: string }[];
}

const EMPTY: SearchResults = { clients: [], orders: [] };

/** Ctrl K: clients (name / phone) and orders (number in any form), scoped by RLS (search_global). */
export async function searchGlobal(q: unknown): Promise<SearchResults> {
  const parsed = searchInput(60, 2).safeParse(q);
  if (!parsed.success || !(await getSessionUser())) return EMPTY;
  const { data, error } = await (await createClient()).rpc("search_global", { q: parsed.data });
  if (error || !data) return EMPTY;
  return data as unknown as SearchResults;
}
