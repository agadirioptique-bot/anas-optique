import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, expectDbError, hasDbEnv, ownFrameOrder, setupFixtures, type Db, type Fixtures } from "./fixtures";

/**
 * Permission matrix (phase 13, SPEC §11). The list of exposed tables, views and RPCs comes from the
 * API's own OpenAPI description, so a new object without a line here fails the test.
 * - anon: no table, view or function.
 * - Every RPC is classified: super admin only, store-scoped, any signed-in role, or invoker
 *   (RLS-bound). Each SECURITY DEFINER one (Supabase advisor 0029, accepted) is proven refused here.
 * - Secretaries read no costs, purchases, suppliers, charges or audit log.
 * - Views are read-only.
 */

type Call = (f: Fixtures, ctx: Ctx) => Record<string, unknown>;
interface Ctx {
  orderB: string;
  client: string;
}

const some = () => randomUUID();
const today = new Date().toISOString().slice(0, 10);

/** SECURITY DEFINER, `private.require_super_admin()` first → a secretary gets OPTICOR:FORBIDDEN. */
const SUPER_ADMIN_ONLY: Record<string, Call> = {
  add_supplier_payment: () => ({ p_purchase_id: some(), p_amount: 10, p_paid_at: today, p_method_id: some(), p_note: null }),
  adjust_stock: (f) => ({ p_store_id: f.storeA, p_category_id: some(), p_counted_qty: 0, p_reason_id: some(), p_note: null }),
  admin_list_users: () => ({}),
  admin_update_user_access: (f) => ({ p_user_id: f.secretaryId, p_role: "super_admin", p_store_id: null, p_is_active: true }),
  apply_free_discount: (_, c) => ({ p_order_id: c.orderB, p_amount: 1 }),
  approve_charge: () => ({ p_charge_id: some(), p_amount: null }),
  cancel_order: (_, c) => ({ p_order_id: c.orderB, p_reason_id: some(), p_note: null, p_refund_amount: 0, p_refund_method_id: null }),
  clear_client_discount: (_, c) => ({ p_client_id: c.client }),
  create_purchase: (f) => ({ payload: { supplier_id: f.ids.supplier, receive_store_id: f.storeA, lines: [] } }),
  create_transfer: (f) => ({ p_from_store_id: f.storeA, p_to_store_id: f.storeB, p_lines: [], p_note: null }),
  kpi_breakdown: () => ({ p_from: today, p_to: today, p_store_id: null }),
  kpi_summary: () => ({ p_from: today, p_to: today, p_store_id: null }),
  kpi_timeseries: () => ({ p_from: today, p_to: today, p_store_id: null }),
  record_damage: (f) => ({ p_store_id: f.storeA, p_category_id: some(), p_qty: 1, p_reason: "x" }),
  set_client_discount: (_, c) => ({ p_client_id: c.client, p_type: "percent", p_value: 50, p_note: null }),
  set_loyalty_threshold: () => ({ p_orders: 1 }),
  set_user_whatsapp: (f) => ({ p_user_id: f.adminId, p_phone: "+212600000000" }),
};

/** SECURITY DEFINER, `private.require_store_access(store)` → a secretary of another store gets OPTICOR:FORBIDDEN. */
const STORE_SCOPED: Record<string, Call> = {
  add_payment: (f, c) => ({ p_order_id: c.orderB, p_amount: 1, p_method_id: f.ids.cash }),
  change_order_status: (_, c) => ({ p_order_id: c.orderB, p_to_status: "in_workshop" }),
  create_order: (f) => ({ payload: ownFrameOrder(f, f.storeB) }),
  deliver_order: (_, c) => ({ p_order_id: c.orderB, p_final_payment: null }),
  set_prescription_photo: (_, c) => ({ p_order_id: c.orderB, p_path: `orders/${c.orderB}/x.jpg` }),
};

/** SECURITY DEFINER, `private.require_role()` → any active profile; anon refused. Shared data only. */
const ANY_ROLE: Record<string, Call> = {
  admin_contacts: () => ({}),
  auth_role: () => ({}),
  auth_store_id: () => ({}),
  client_directory: () => ({ p_q: "", p_segment: "all", p_sort: "name", p_limit: 1, p_offset: 0 }),
  client_order_stats: (_, c) => ({ p_client_id: c.client }),
  user_names: (f) => ({ p_ids: [f.adminId] }),
};

/** SECURITY INVOKER: RLS of the caller applies; only checked for anon. */
const INVOKER: Record<string, Call> = {
  business_date: () => ({ ts: new Date().toISOString() }),
  charge_totals: () => ({ p_from: today, p_to: today, p_location_id: null, p_category_id: null }),
  format_order_number: () => ({ prefix: "TSA", booklet: null, slip_number: 1, digits: 6 }),
  is_super_admin: () => ({}),
  is_valid_diopter: () => ({ value: 1 }),
  mark_notifications_read: () => ({ p_ids: [] }),
  reorder_rows: () => ({ p_table: "stores", p_ids: [] }),
  search_global: () => ({ q: "zz" }),
  similar_clients: () => ({ p_name: "zzz" }),
  storage_order_id: () => ({ p_name: "x" }),
};

/** pg_cron jobs and the Auth hook: no API role may call them, not even a super admin. */
const SERVER_ONLY: Record<string, Call> = {
  custom_access_token_hook: (f) => ({ event: { user_id: f.secretaryId, claims: {} } }),
  generate_recurring_charges: () => ({}),
  notify_stuck_orders: () => ({}),
};

const ALL_RPCS = { ...SUPER_ADMIN_ONLY, ...STORE_SCOPED, ...ANY_ROLE, ...INVOKER, ...SERVER_ONLY };

/** Secretaries must never read these (CLAUDE.md rule 2): no rows, or no privilege at all. */
const ADMIN_ONLY_RELATIONS = [
  "purchases",
  "purchase_lines",
  "suppliers",
  "supplier_payments",
  "charges",
  "recurring_charges",
  "audit_log",
  "charge_overview",
  "purchase_overview",
  "purchase_balances",
  "supplier_balances",
  "purchasing_summary",
] as const;

async function exposedApi(): Promise<{ relations: string[]; rpcs: string[] }> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/openapi+json" },
  });
  if (!res.ok) throw new Error(`OpenAPI ${res.status}`);
  const spec = (await res.json()) as { paths: Record<string, unknown> };
  const paths = Object.keys(spec.paths).filter((p) => p !== "/");
  return {
    relations: paths.filter((p) => !p.startsWith("/rpc/")).map((p) => p.slice(1)),
    rpcs: paths.filter((p) => p.startsWith("/rpc/")).map((p) => p.slice(5)),
  };
}

const call = (db: Db, name: string, args: Record<string, unknown>) => db.rpc(name as never, args as never);

describe.skipIf(!hasDbEnv)("security matrix", () => {
  let f: Fixtures;
  let ctx: Ctx;
  let api: { relations: string[]; rpcs: string[] };
  const anon = hasDbEnv ? anonClient() : (null as unknown as Db);

  beforeAll(async () => {
    f = await setupFixtures();
    api = await exposedApi();
    // An order (and its client) in store B, which the store A secretary must not touch.
    const { data, error } = await f.admin.rpc("create_order", { payload: ownFrameOrder(f, f.storeB) });
    if (error) throw error;
    const orderB = (data as { order_id: string }).order_id;
    const { data: order } = await f.admin.from("orders").select("client_id").eq("id", orderB).single();
    ctx = { orderB, client: order!.client_id };
    // Something in every admin-only relation: a purchase with lines, a supplier payment (→ charge).
    const category = await f.newFrameCategory("security");
    await f.addStock(f.storeA, category, 1);
    const { data: purchase } = await f.admin.from("purchases").select("id").eq("supplier_id", f.ids.supplier).limit(1).single();
    const pay = await f.admin.rpc("add_supplier_payment", { p_purchase_id: purchase!.id, p_amount: 10, p_paid_at: today, p_method_id: f.ids.cash });
    if (pay.error) throw pay.error;
  });

  afterAll(async () => {
    if (ctx) await f.admin.rpc("cancel_order", { p_order_id: ctx.orderB, p_reason_id: f.ids.cancelReason, p_note: "test", p_refund_amount: 0 });
    await f?.cleanup();
  });

  it("every exposed RPC is classified here", () => {
    expect(api.rpcs.length).toBeGreaterThan(0);
    expect(api.rpcs.filter((name) => !(name in ALL_RPCS)).sort()).toEqual([]);
  });

  it("anon can call no function", async () => {
    for (const name of api.rpcs) {
      const { error } = await call(anon, name, ALL_RPCS[name](f, ctx));
      expect(error, name).not.toBeNull();
      expect(error?.code, name).toBe("42501");
    }
  });

  it("anon can read no table or view", async () => {
    expect(api.relations.length).toBeGreaterThan(20);
    for (const relation of api.relations) {
      const { data, error } = await anon.from(relation as never).select("*").limit(1);
      expect(error?.code, relation).toBe("42501");
      expect(data, relation).toBeNull();
    }
  });

  it("cron jobs and the token hook can't be called through the API", async () => {
    for (const [name, args] of Object.entries(SERVER_ONLY)) {
      for (const db of [f.admin, f.secretary]) {
        const { error } = await call(db, name, args(f, ctx));
        expect(error?.code, name).toBe("42501");
      }
    }
  });

  it("a secretary is refused every super-admin RPC (advisor 0029)", async () => {
    for (const [name, args] of Object.entries(SUPER_ADMIN_ONLY)) {
      const { error } = await call(f.secretary, name, args(f, ctx));
      expectDbError(error, "FORBIDDEN");
    }
  });

  it("a secretary of another store is refused every store-scoped RPC (advisor 0029)", async () => {
    for (const [name, args] of Object.entries(STORE_SCOPED)) {
      const { error } = await call(f.secretary, name, args(f, ctx));
      expectDbError(error, "FORBIDDEN");
    }
    const { data } = await f.admin.from("orders").select("status").eq("id", ctx.orderB).single();
    expect(data?.status).toBe("confirmed");
    const { count } = await f.admin.from("payments").select("id", { count: "exact", head: true }).eq("order_id", ctx.orderB);
    expect(count).toBe(0);
  });

  it("role RPCs work for a secretary and answer for herself only", async () => {
    for (const [name, args] of Object.entries(ANY_ROLE)) {
      const { error } = await call(f.secretary, name, args(f, ctx));
      expect(error, name).toBeNull();
    }
    expect((await f.secretary.rpc("auth_role")).data).toBe("secretary");
    expect((await f.secretary.rpc("auth_store_id")).data).toBe(f.storeA);
  });

  it("a secretary reads no cost, purchase, supplier, charge or audit row", async () => {
    for (const relation of ADMIN_ONLY_RELATIONS) {
      const admin = await f.admin.from(relation as "purchases").select("*", { count: "exact", head: true });
      expect(admin.error, relation).toBeNull();
      expect(admin.count, `${relation} has rows for the admin`).toBeGreaterThan(0);
      const { data, error } = await f.secretary.from(relation as "purchases").select("*").limit(5);
      if (error) expect(error.code, relation).toBe("42501");
      // Totals views answer one row of zeros: nothing of the admin's data shows through.
      else if (relation === "purchasing_summary") expect(data, relation).toEqual([{ owed: 0, total_bought: 0, unpaid_count: 0 }]);
      else expect(data, relation).toEqual([]);
    }
  });

  it("views are read-only for signed-in users", async () => {
    const views = { order_overview: "id", stock_levels: "store_id", charge_overview: "id", purchase_overview: "id", supplier_balances: "supplier_id" };
    for (const [view, column] of Object.entries(views)) {
      const { error } = await f.admin.from(view as "order_overview").delete().eq(column as "id", some());
      // 42501 = no privilege; 55000 = the view can't be written at all (joins / aggregates).
      expect(["42501", "55000"], view).toContain(error?.code);
    }
  });
});
