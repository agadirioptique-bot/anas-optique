import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectDbError, hasDbEnv, ownFrameOrder, setupFixtures, type Fixtures } from "./fixtures";

/** SPEC §3 / §7: what a secretary can and cannot reach, enforced by Postgres. */
describe.skipIf(!hasDbEnv)("permissions (RLS + RPC checks)", () => {
  let f: Fixtures;
  let orderA: string;
  let orderB: string;
  let slipB: number;

  beforeAll(async () => {
    f = await setupFixtures();

    const a = await f.secretary.rpc("create_order", { payload: ownFrameOrder(f, f.storeA) });
    if (a.error) throw a.error;
    orderA = (a.data as { order_id: string }).order_id;

    const payloadB = ownFrameOrder(f, f.storeB);
    slipB = payloadB.slip_number;
    const b = await f.admin.rpc("create_order", { payload: payloadB });
    if (b.error) throw b.error;
    orderB = (b.data as { order_id: string }).order_id;

    // A purchase + supplier payment so purchases, charges and audit_log have rows.
    const category = await f.newFrameCategory("perm");
    await f.addStock(f.storeA, category, 1);
    const { data: purchase } = await f.admin.from("purchases").select("id").order("created_at", { ascending: false }).limit(1).single();
    const pay = await f.admin.rpc("add_supplier_payment", { p_purchase_id: purchase!.id, p_amount: 10, p_method_id: f.ids.cash });
    if (pay.error) throw pay.error;
  });

  afterAll(async () => {
    await f?.cleanup();
  });

  it("secretary reads her store's orders but never another store's", async () => {
    const own = await f.secretary.from("orders").select("id").eq("id", orderA);
    expect(own.data).toHaveLength(1);

    const other = await f.secretary.from("orders").select("id").eq("id", orderB);
    expect(other.error).toBeNull();
    expect(other.data).toHaveLength(0);

    const asAdmin = await f.admin.from("orders").select("id").eq("id", orderB);
    expect(asAdmin.data).toHaveLength(1);

    // Child tables follow the order's visibility.
    for (const table of ["payments", "order_items", "order_treatments", "order_status_history"] as const) {
      const rows = await f.secretary.from(table).select("order_id").eq("order_id", orderB);
      expect(rows.data, table).toHaveLength(0);
    }
    const history = await f.secretary.from("order_status_history").select("order_id").eq("order_id", orderA);
    expect(history.data).toHaveLength(1);
  });

  it("secretary cannot read purchases, suppliers, charges, audit log, transfers", async () => {
    for (const table of [
      "purchases",
      "purchase_lines",
      "supplier_payments",
      "suppliers",
      "charges",
      "recurring_charges",
      "charge_locations",
      "audit_log",
      "transfers",
    ] as const) {
      const asSecretary = await f.secretary.from(table).select("*").limit(1);
      expect(asSecretary.error, table).toBeNull();
      expect(asSecretary.data, table).toHaveLength(0);
    }
    for (const table of ["purchases", "supplier_payments", "suppliers", "charges", "audit_log"] as const) {
      const asAdmin = await f.admin.from(table).select("*").limit(1);
      expect(asAdmin.data?.length, table).toBe(1);
    }
    const balances = await f.secretary.from("purchase_balances").select("*").limit(1);
    expect(balances.data).toHaveLength(0);
  });

  it("the app shell's own queries still work for both roles", async () => {
    // getSessionUser: own profile; getVisibleStores: active stores.
    const own = await f.secretary.from("profiles").select("id, role, store_id, is_active").eq("id", f.secretaryId).single();
    expect(own.data).toMatchObject({ role: "secretary", store_id: f.storeA, is_active: true });
    const others = await f.secretary.from("profiles").select("id").neq("id", f.secretaryId);
    expect(others.data).toHaveLength(0);
    const stores = await f.secretary.from("stores").select("id").eq("is_active", true);
    expect(stores.data?.map((s) => s.id)).toContain(f.storeA);

    const users = await f.admin.rpc("admin_list_users");
    expect(users.error).toBeNull();
    expectDbError((await f.secretary.rpc("admin_list_users")).error, "FORBIDDEN");

    // Reference data for the forms.
    for (const table of ["settings_list_items", "product_categories", "custom_fields", "app_settings"] as const) {
      const rows = await f.secretary.from(table).select("*").limit(1);
      expect(rows.data?.length, table).toBe(1);
    }
    const write = await f.secretary.from("app_settings").update({ value: { orders: 1 } }).eq("key", "loyalty_threshold").select("key");
    expect(write.data ?? []).toHaveLength(0);
  });

  it("secretary sees only her store's stock", async () => {
    const rows = await f.secretary.from("stock_movements").select("store_id");
    expect(rows.data?.every((r) => r.store_id === f.storeA)).toBe(true);
  });

  it("secretary cannot set discounts, cancel, or step an order back", async () => {
    const { data: order } = await f.secretary.from("orders").select("client_id").eq("id", orderA).single();

    const direct = await f.secretary.from("clients").update({ pending_discount_type: "percent", pending_discount_value: 50 }).eq("id", order!.client_id);
    expect(direct.error?.code).toBe("42501");

    expectDbError(
      (await f.secretary.rpc("set_client_discount", { p_client_id: order!.client_id, p_type: "percent", p_value: 10 })).error,
      "FORBIDDEN",
    );
    expectDbError((await f.secretary.rpc("apply_free_discount", { p_order_id: orderA, p_amount: 10 })).error, "FORBIDDEN");
    expectDbError((await f.secretary.rpc("cancel_order", { p_order_id: orderA, p_reason_id: f.ids.cancelReason })).error, "FORBIDDEN");

    const forward = await f.secretary.rpc("change_order_status", { p_order_id: orderA, p_to_status: "in_workshop" });
    expect(forward.error).toBeNull();
    expectDbError(
      (await f.secretary.rpc("change_order_status", { p_order_id: orderA, p_to_status: "confirmed" })).error,
      "FORBIDDEN",
    );
  });

  it("secretary can edit a client's contact fields", async () => {
    const { data: order } = await f.secretary.from("orders").select("client_id").eq("id", orderA).single();
    const { error } = await f.secretary.from("clients").update({ notes: "Préfère être appelé le matin" }).eq("id", order!.client_id);
    expect(error).toBeNull();
  });

  it("secretary cannot act on another store or on stock/purchasing", async () => {
    expectDbError((await f.secretary.rpc("create_order", { payload: ownFrameOrder(f, f.storeB) })).error, "FORBIDDEN");
    expectDbError((await f.secretary.rpc("add_payment", { p_order_id: orderB, p_amount: 10, p_method_id: f.ids.cash })).error, "FORBIDDEN");
    expectDbError(
      (await f.secretary.rpc("record_damage", { p_store_id: f.storeA, p_category_id: f.ids.frameType, p_qty: 1, p_reason: "x" })).error,
      "FORBIDDEN",
    );
    expectDbError(
      (await f.secretary.rpc("create_purchase", { payload: { supplier_id: f.ids.supplier, receive_store_id: f.storeA, lines: [] } })).error,
      "FORBIDDEN",
    );
    const insertMovement = await f.secretary
      .from("stock_movements")
      .insert({ store_id: f.storeA, category_id: f.ids.frameType, qty_delta: 5, kind: "purchase" });
    expect(insertMovement.error).not.toBeNull();
  });

  it("ledgers are read-only even for the super admin", async () => {
    const update = await f.admin.from("orders").update({ subtotal: 1 }).eq("id", orderB).select("id");
    expect(update.data ?? []).toHaveLength(0);
    const insert = await f.admin.from("payments").insert({ order_id: orderB, amount: 1, method_id: f.ids.cash, kind: "balance" });
    expect(insert.error).not.toBeNull();
  });

  it("cron functions cannot be called by app users", async () => {
    expect((await f.admin.rpc("generate_recurring_charges", {})).error).not.toBeNull();
    expect((await f.secretary.rpc("notify_stuck_orders")).error).not.toBeNull();
  });

  it("client stats count all stores, search stays in scope", async () => {
    const { data: order } = await f.admin.from("orders").select("client_id").eq("id", orderB).single();
    const stats = await f.secretary.rpc("client_order_stats", { p_client_id: order!.client_id });
    expect(stats.error).toBeNull();
    expect((stats.data as { orders: number }).orders).toBe(1);

    const bySecretary = await f.secretary.rpc("search_global", { q: `TSB-${slipB}` });
    expect((bySecretary.data as { orders: unknown[] }).orders).toHaveLength(0);
    const byAdmin = await f.admin.rpc("search_global", { q: `tsb ${String(slipB).padStart(10, "0")}` });
    expect((byAdmin.data as { orders: { id: string }[] }).orders.map((o) => o.id)).toContain(orderB);
  });

  it("client directory and names: counts and names only, never money", async () => {
    const dir = await f.secretary.rpc("client_directory", { p_q: "Client Test", p_segment: "all", p_sort: "recent", p_limit: 5, p_offset: 0 });
    expect(dir.error).toBeNull();
    const rows = (dir.data as { rows: Record<string, unknown>[] }).rows;
    expect(rows.length).toBeGreaterThan(0);
    for (const key of ["total", "paid", "balance", "spent", "subtotal"]) expect(rows[0]).not.toHaveProperty(key);

    const { data: order } = await f.admin.from("orders").select("client_id").eq("id", orderB).single();
    const stats = await f.secretary.rpc("client_order_stats", { p_client_id: order!.client_id });
    expect((stats.data as { spent: unknown }).spent).toBeNull();
    const adminStats = await f.admin.rpc("client_order_stats", { p_client_id: order!.client_id });
    expect((adminStats.data as { spent: number }).spent).toBe(400);

    const names = await f.secretary.rpc("user_names", { p_ids: [f.adminId] });
    expect(names.data).toEqual([{ id: f.adminId, full_name: "Test Super Admin" }]);
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    expect((await anon.rpc("user_names", { p_ids: [f.adminId] })).error).not.toBeNull();
  });

  it("prescription photo path must be an uploaded file of that order, in the user's store", async () => {
    expectDbError((await f.secretary.rpc("set_prescription_photo", { p_order_id: orderA, p_path: `prescriptions/${orderA}/missing.png` })).error, "INVALID_INPUT");
    expectDbError((await f.secretary.rpc("set_prescription_photo", { p_order_id: orderA, p_path: `prescriptions/${orderB}/x.png` })).error, "INVALID_INPUT");
    expectDbError((await f.secretary.rpc("set_prescription_photo", { p_order_id: orderB, p_path: `prescriptions/${orderB}/x.png` })).error, "FORBIDDEN");

    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
    const path = `prescriptions/${orderA}/rx-${Date.now()}.png`;
    expect((await f.secretary.storage.from("private").upload(path, png, { contentType: "image/png" })).error).toBeNull();
    expect((await f.secretary.rpc("set_prescription_photo", { p_order_id: orderA, p_path: path })).error).toBeNull();
    const { data } = await f.secretary.from("orders").select("prescription_photo_path").eq("id", orderA).single();
    expect(data?.prescription_photo_path).toBe(path);
    await f.admin.storage.from("private").remove([path]);
  });

  it("prescription photos: own store only", async () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
    const own = await f.secretary.storage.from("private").upload(`prescriptions/${orderA}/test.png`, png, { contentType: "image/png" });
    expect(own.error).toBeNull();
    const other = await f.secretary.storage.from("private").upload(`prescriptions/${orderB}/test.png`, png, { contentType: "image/png" });
    expect(other.error).not.toBeNull();
    const secretaryDelete = await f.secretary.storage.from("private").remove([`prescriptions/${orderA}/test.png`]);
    expect(secretaryDelete.data ?? []).toHaveLength(0);
    const adminDelete = await f.admin.storage.from("private").remove([`prescriptions/${orderA}/test.png`]);
    expect(adminDelete.data).toHaveLength(1);
  });
});
