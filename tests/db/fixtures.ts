import { randomBytes, randomInt } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

/**
 * DEV-only fixtures (SPEC §2 tests): two test stores (TSA, TSB), a secretary of TSA and a super admin.
 * Passwords are random per run and never leave this process. Test data is kept, scoped to TSA/TSB.
 */

export type Db = SupabaseClient<Database>;

export const hasDbEnv = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TEST_STORES = [
  { prefix: "TSA", name: "Test Succursale A" },
  { prefix: "TSB", name: "Test Succursale B" },
] as const;

const TEST_USERS = {
  secretary: { email: "opticor-test-secretary@example.com", fullName: "Test Secrétaire", role: "secretary" as const },
  admin: { email: "opticor-test-admin@example.com", fullName: "Test Super Admin", role: "super_admin" as const },
};

export interface Fixtures {
  /** Service role: setup and the cron functions only. */
  service: Db;
  admin: Db;
  secretary: Db;
  adminId: string;
  secretaryId: string;
  storeA: string;
  storeB: string;
  ids: {
    cash: string;
    cancelReason: string;
    adjustReason: string;
    treatment: string;
    lensType: string;
    rentCategory: string;
    frameType: string;
    supplier: string;
  };
  /** A frame category created for this run (starts with 0 stock everywhere). */
  newFrameCategory(label: string): Promise<string>;
  /** Unique slip number for this run. */
  nextSlip(): number;
  /** Random unused Moroccan mobile in E.164. */
  newPhone(): string;
  /** Adds stock at a location through create_purchase (as the test admin). */
  addStock(storeId: string, categoryId: string, qty: number): Promise<void>;
  stockOf(client: Db, storeId: string, categoryId: string): Promise<number>;
}

function anonClient(): Db {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function ensureStore(service: Db, prefix: string, name: string): Promise<string> {
  const { data } = await service.from("stores").select("id").eq("prefix", prefix).maybeSingle();
  if (data) return data.id;
  const { data: created, error } = await service.from("stores").insert({ prefix, name, kind: "store" }).select("id").single();
  if (error) throw error;
  return created.id;
}

async function ensureUser(
  service: Db,
  user: (typeof TEST_USERS)[keyof typeof TEST_USERS],
  storeId: string | null,
  password: string,
): Promise<string> {
  const { data: profile } = await service.from("profiles").select("id").eq("email", user.email).maybeSingle();
  let id = profile?.id;
  if (id) {
    const { error } = await service.auth.admin.updateUserById(id, { password, ban_duration: "none" });
    if (error) throw error;
  } else {
    const { data, error } = await service.auth.admin.createUser({ email: user.email, password, email_confirm: true });
    if (error) throw error;
    id = data.user.id;
  }
  const { error } = await service
    .from("profiles")
    .upsert({ id, email: user.email, full_name: user.fullName, role: user.role, store_id: storeId, is_active: true });
  if (error) throw error;
  return id;
}

async function signIn(email: string, password: string): Promise<Db> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function listItem(db: Db, listKey: string, code: string): Promise<string> {
  const { data, error } = await db.from("settings_list_items").select("id").eq("list_key", listKey).eq("code", code).single();
  if (error) throw error;
  return data.id;
}

export async function setupFixtures(): Promise<Fixtures> {
  const service = createAdminClient();
  const storeA = await ensureStore(service, TEST_STORES[0].prefix, TEST_STORES[0].name);
  const storeB = await ensureStore(service, TEST_STORES[1].prefix, TEST_STORES[1].name);

  const password = randomBytes(24).toString("base64url");
  const secretaryId = await ensureUser(service, TEST_USERS.secretary, storeA, password);
  const adminId = await ensureUser(service, TEST_USERS.admin, null, password);
  const secretary = await signIn(TEST_USERS.secretary.email, password);
  const admin = await signIn(TEST_USERS.admin.email, password);

  const { data: frameType, error: typeError } = await admin.from("product_types").select("id").eq("key", "frames").single();
  if (typeError) throw typeError;

  const runId = Date.now().toString(36);
  const { data: supplier, error: supplierError } = await admin
    .from("suppliers")
    .insert({ name: `Fournisseur test ${runId}` })
    .select("id")
    .single();
  if (supplierError) throw supplierError;

  const ids = {
    cash: await listItem(admin, "payment_methods", "cash"),
    cancelReason: await listItem(admin, "cancel_reasons", "client_changed_mind"),
    adjustReason: await listItem(admin, "adjustment_reasons", "physical_count"),
    treatment: await listItem(admin, "treatments", "anti_reflective"),
    lensType: await listItem(admin, "lens_types", "single_vision"),
    rentCategory: await listItem(admin, "charge_categories", "rent"),
    frameType: frameType.id,
    supplier: supplier.id,
  };

  // Seconds × 100 (cycle ≈ 11 days): unique per run, room for 100 orders, ≤ 9 digits like real slips.
  let slip = (Math.floor(Date.now() / 1000) % 1_000_000) * 100;

  const fixtures: Fixtures = {
    service,
    admin,
    secretary,
    adminId,
    secretaryId,
    storeA,
    storeB,
    ids,
    async newFrameCategory(label) {
      const { data, error } = await admin
        .from("product_categories")
        .insert({ product_type_id: ids.frameType, name: `Test ${label} ${runId}`, sale_price: 200 })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    nextSlip: () => ++slip,
    newPhone: () => `+2126${randomInt(10_000_000, 99_999_999)}`,
    async addStock(storeId, categoryId, qty) {
      const { error } = await admin.rpc("create_purchase", {
        payload: {
          supplier_id: ids.supplier,
          receive_store_id: storeId,
          lines: [{ kind: "stock", category_id: categoryId, unit_price: 50, qty }],
        },
      });
      if (error) throw error;
    },
    async stockOf(client, storeId, categoryId) {
      const { data, error } = await client
        .from("stock_levels")
        .select("quantity")
        .eq("store_id", storeId)
        .eq("category_id", categoryId)
        .maybeSingle();
      if (error) throw error;
      return data?.quantity ?? 0;
    },
  };
  return fixtures;
}

/** The call failed with this OPTICOR code. */
export function expectDbError(error: { message?: string } | null, code: string) {
  expect(error, `expected OPTICOR:${code}`).not.toBeNull();
  expect(error?.message).toContain(`OPTICOR:${code}`);
}

/** Minimal order payload: the client brings their own frame, no stock involved. */
export function ownFrameOrder(f: Fixtures, storeId: string, extra: Record<string, unknown> = {}) {
  return {
    store_id: storeId,
    slip_number: f.nextSlip(),
    new_client: { full_name: "Client Test", phone_e164: f.newPhone(), has_whatsapp: true },
    client_own_frame: true,
    lens_type_id: f.ids.lensType,
    treatment_ids: [f.ids.treatment],
    subtotal: 400,
    ...extra,
  };
}
