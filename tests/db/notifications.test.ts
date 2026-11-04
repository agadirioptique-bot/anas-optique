import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "@/types/database";
import { expectDbError, hasDbEnv, ownFrameOrder, setupFixtures, type Db, type Fixtures } from "./fixtures";

/**
 * Notifications (SPEC §10, phase 12): each kind reaches the right people exactly once per event,
 * and never fires again for the same event. client_became_loyal (once per client) and
 * clients_became_loyal are covered in rules.test.ts / settings.test.ts.
 */
describe.skipIf(!hasDbEnv)("notifications", () => {
  let f: Fixtures;
  const cleanups: (() => PromiseLike<unknown>)[] = [];

  beforeAll(async () => {
    f = await setupFixtures();
  });

  afterAll(async () => {
    for (const c of cleanups) await c();
    await f?.cleanup();
  });

  const count = async (db: Db, kind: string, params: Record<string, unknown>) =>
    (await db.from("notifications").select("id").eq("kind", kind).contains("params", params)).data!.length;

  const damage = async (store: string, category: string, qty: number) => {
    const { error } = await f.admin.rpc("record_damage", { p_store_id: store, p_category_id: category, p_qty: qty, p_reason: "Test notif" });
    if (error) throw error;
  };

  it("low_stock: once per crossing down to the threshold, for super admins and that store only", async () => {
    const category = await f.newFrameCategory("notif-low");
    await f.admin.from("category_thresholds").insert({ store_id: f.storeA, category_id: category, low_stock_min: 2 });
    await f.addStock(f.storeA, category, 5);
    const params = { category_id: category, store_id: f.storeA };

    await damage(f.storeA, category, 2); // 3: still above
    expect([await count(f.admin, "low_stock", params), await count(f.secretary, "low_stock", params)]).toEqual([0, 0]);
    await damage(f.storeA, category, 1); // 2: crosses
    expect([await count(f.admin, "low_stock", params), await count(f.secretary, "low_stock", params)]).toEqual([1, 1]);
    await damage(f.storeA, category, 1); // 1: already low → nothing new
    expect([await count(f.admin, "low_stock", params), await count(f.secretary, "low_stock", params)]).toEqual([1, 1]);

    // Refilled then low again: a new event, notified once more.
    const { error } = await f.admin.rpc("adjust_stock", { p_store_id: f.storeA, p_category_id: category, p_counted_qty: 5, p_reason_id: f.ids.adjustReason });
    expect(error).toBeNull();
    await damage(f.storeA, category, 3);
    expect([await count(f.admin, "low_stock", params), await count(f.secretary, "low_stock", params)]).toEqual([2, 2]);

    // Another store: the TSA secretary hears nothing.
    await f.admin.from("category_thresholds").insert({ store_id: f.storeB, category_id: category, low_stock_min: 1 });
    await f.addStock(f.storeB, category, 2);
    await damage(f.storeB, category, 1);
    const other = { category_id: category, store_id: f.storeB };
    expect([await count(f.admin, "low_stock", other), await count(f.secretary, "low_stock", other)]).toEqual([1, 0]);
  });

  it("order_stuck: once per order and status, however often the daily job runs", async () => {
    const { data, error } = await f.secretary.rpc("create_order", { payload: ownFrameOrder(f, f.storeA) as Json });
    expect(error).toBeNull();
    const orderId = (data as { order_id: string }).order_id;
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    await f.service.from("orders").update({ created_at: tenDaysAgo }).eq("id", orderId);
    await f.service.from("order_status_history").update({ changed_at: tenDaysAgo }).eq("order_id", orderId);
    // Moved forward at the end so it doesn't stay stuck on dev.
    cleanups.push(() => f.secretary.rpc("change_order_status", { p_order_id: orderId, p_to_status: "in_workshop" }));

    for (let i = 0; i < 2; i++) expect((await f.service.rpc("notify_stuck_orders")).error).toBeNull();
    const params = { order_id: orderId, status: "confirmed" };
    expect([await count(f.admin, "order_stuck", params), await count(f.secretary, "order_stuck", params)]).toEqual([1, 1]);
    const { data: note } = await f.admin.from("notifications").select("link, dedupe_key").eq("kind", "order_stuck").contains("params", params).single();
    expect(note).toEqual({ link: `/orders/${orderId}`, dedupe_key: `order_stuck:${orderId}:confirmed` });
  });

  it("duplicate_slip_blocked: one per blocked attempt, super admins only", async () => {
    const payload = ownFrameOrder(f, f.storeA);
    const created = await f.secretary.rpc("create_order", { payload: payload as Json });
    const orderId = (created.data as { order_id: string }).order_id;
    const again = await f.secretary.rpc("create_order", { payload: payload as Json });
    expect((again.data as { error: string }).error).toBe("DUPLICATE_SLIP");

    const params = { order_id: orderId };
    expect([await count(f.admin, "duplicate_slip_blocked", params), await count(f.secretary, "duplicate_slip_blocked", params)]).toEqual([1, 0]);
  });

  it("recurring_charges_pending: once per day for super admins, never for secretaries", async () => {
    const { data: general } = await f.admin.from("charge_locations").select("id").eq("is_general", true).single();
    const { data: recurring } = await f.admin
      .from("recurring_charges")
      .insert({ label: `Notif test ${Date.now()}`, amount: 10, category_id: f.ids.rentCategory, location_id: general!.id, day_of_month: 1 })
      .select("id")
      .single();
    cleanups.push(() => f.admin.from("recurring_charges").update({ is_active: false }).eq("id", recurring!.id));
    cleanups.push(() => f.admin.from("charges").update({ is_deleted: true }).eq("recurring_charge_id", recurring!.id));

    const { data: today } = await f.service.rpc("business_date", { ts: new Date().toISOString() });
    for (let i = 0; i < 2; i++) expect((await f.service.rpc("generate_recurring_charges", { p_date: today! })).error).toBeNull();
    const key = `recurring_charges_pending:${today}`;
    expect((await f.admin.from("notifications").select("id").eq("dedupe_key", key)).data).toHaveLength(1);
    expect((await f.secretary.from("notifications").select("id").eq("kind", "recurring_charges_pending")).data).toEqual([]);
  });

  it("each user reads and marks only their own notifications, and only read_at", async () => {
    const { data: mine } = await f.admin.from("notifications").select("id").is("read_at", null).limit(1).single();
    expect(mine).toBeTruthy();

    expect((await f.secretary.from("notifications").select("id").eq("id", mine!.id)).data).toEqual([]);
    expect((await f.secretary.rpc("mark_notifications_read", { p_ids: [mine!.id] })).data).toBe(0);
    expect((await f.secretary.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", mine!.id).select("id")).data).toEqual([]);
    expect((await f.admin.from("notifications").update({ kind: "hacked" }).eq("id", mine!.id)).error?.code).toBe("42501");

    expect((await f.admin.rpc("mark_notifications_read", { p_ids: [mine!.id] })).data).toBe(1);
    expect((await f.admin.from("notifications").select("read_at").eq("id", mine!.id).single()).data!.read_at).toBeTruthy();
    expect((await f.admin.rpc("mark_notifications_read", { p_ids: [mine!.id] })).data).toBe(0);

    // Mark all: nothing unread is left for the secretary.
    expect((await f.secretary.rpc("mark_notifications_read", {})).error).toBeNull();
    expect((await f.secretary.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null)).count).toBe(0);
    expectDbError((await f.secretary.rpc("record_damage", { p_store_id: f.storeA, p_category_id: f.ids.frameType, p_qty: 1, p_reason: "x" })).error, "FORBIDDEN");
  });
});
