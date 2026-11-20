import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";
import { ensureStore, expectDbError, hasDbEnv, openTestStore, setupFixtures, type Db, type Fixtures } from "./fixtures";

type OrderInsert = Omit<Database["public"]["Tables"]["orders"]["Insert"], "store_id" | "slip_number">;

/**
 * Dashboard KPIs (SPEC §9, phase 11) on a small FIXED dataset: store TSK "Test KPI", dated
 * Dec 2000 – Feb 2001 (no other data lives there), so totals are exact even under "All stores".
 * The dataset is rebuilt at each run (service role, direct inserts with fixed timestamps).
 *
 * January 2001 at TSK (amounts in DH):
 *   O1  C1  10 Jan 09:15  subtotal 1000, discount 100 → total 900, frame "KPI Monture A" 400,
 *           Unifocal + Anti-reflet + Bleu, in store 14 Jan, delivered 17 Jan, paid 500 (10 Jan) + 400 (17 Jan)
 *   O2  C1  15 Jan 14:30  total 600, client's own frame, Unifocal + Anti-reflet, in store 17 Jan, paid 200 (15 Jan)
 *   O3  C2  20 Jan 11:00  total 800, frame "KPI Monture B" 300, Progressif, confirmed, nothing paid
 *   O4  C3  22 Jan 16:00  total 500, CANCELLED, paid 100 (22 Jan) then refunded −100 (23 Jan)
 *   damage: 1 "KPI Monture A" frame (20 Jan)
 *   charges: TSK 300 approved, TSK 999 pending, TSK 444 deleted, Général 200, TSB 150, Lab 120 (all approved, Jan)
 * December 2000 at TSK: O5 C2 300 delivered + paid, O7 C1 250 delivered + paid, charge TSK 50.
 * February 2001 at TSK: O6 C3 200 confirmed;
 *   O8 C2 10 Feb total 400, deposit 150 (10 Feb), CANCELLED 12 Feb WITHOUT refund (the shop keeps 150);
 *   O9 C2 20 Feb total 300, paid 300 (20 Feb), CANCELLED 2 Mar with a full refund −300 (2 Mar).
 * C1 is loyal and has 2 delivered orders (O1, O7); C2 has 1 (O5); C3 none.
 * Purchase received at TSK (created once, kept): 2 × 100, paid 50 → owed 150.
 */
describe.skipIf(!hasDbEnv)("dashboard KPIs", () => {
  let f: Fixtures;
  let tsk: string;
  let lab: string;
  let restoreTsk: () => Promise<void>;
  let ids: { o1: string; o2: string; o3: string; o4: string };

  const JAN = { from: "2001-01-01", to: "2001-01-31" };
  const DEC = { from: "2000-12-01", to: "2000-12-31" };

  async function summary(db: Db, range: { from: string; to: string }, store: string | null) {
    const { data, error } = await db.rpc("kpi_summary", { p_from: range.from, p_to: range.to, p_store_id: store ?? undefined });
    if (error) throw error;
    return data as Record<string, number | null>;
  }

  /**
   * Removes the open part of the fixture (TSK orders, damage movements, fixture charges) so it never
   * shows up in the live app (workshop, pick-up list, pending charges, badges). Run before and after.
   * The purchase stays: its supplier-payment charge is read-only by design.
   */
  async function removeFixture() {
    const s = f.service;
    const old = ((await s.from("orders").select("id").eq("store_id", tsk)).data ?? []).map((o) => o.id);
    if (old.length) {
      for (const table of ["payments", "order_status_history", "order_items", "order_treatments"] as const) {
        const { error } = await s.from(table).delete().in("order_id", old);
        if (error) throw error;
      }
      const { error } = await s.from("orders").delete().in("id", old);
      if (error) throw error;
    }
    await s.from("stock_movements").delete().eq("store_id", tsk).eq("kind", "damage");
    await s.from("charges").delete().like("reason", "KPI fixture%");
  }

  beforeAll(async () => {
    f = await setupFixtures();
    const s = f.service;
    tsk = await ensureStore(s, "TSK", "Test KPI");
    // Active (orders) with an open charge location (charges) only while the tests run; put back as found.
    restoreTsk = await openTestStore(s, tsk);
    lab = (await s.from("stores").select("id").eq("kind", "lab").eq("is_active", true).single()).data!.id;
    const one = async <T,>(p: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> => {
      const { data, error } = await p;
      if (error) throw error;
      return data as NonNullable<T>;
    };
    const item = async (list: string, code: string) => (await one(s.from("settings_list_items").select("id").eq("list_key", list).eq("code", code).single())).id;

    // --- clean the previous run (TSK orders, damage movements, fixture charges) ---
    await removeFixture();

    // --- reference data ---
    const frames = (await one(s.from("product_types").select("id").eq("key", "frames").single())).id;
    const category = async (name: string) => {
      const { data: found } = await s.from("product_categories").select("id").eq("name", name).eq("product_type_id", frames).maybeSingle();
      if (found) return found.id;
      return (await one(s.from("product_categories").insert({ product_type_id: frames, name, sale_price: 400, is_archived: true }).select("id").single())).id;
    };
    const catA = await category("KPI Monture A");
    const catB = await category("KPI Monture B");
    const unifocal = await item("lens_types", "single_vision");
    const progressive = await item("lens_types", "progressive");
    const antiReflet = await item("treatments", "anti_reflective");
    const blue = await item("treatments", "blue_light");
    const cash = f.ids.cash;
    const client = async (phone: string, name: string, loyal: boolean) =>
      (
        await one(
          s
            .from("clients")
            .upsert(
              { phone_e164: phone, full_name: name, is_loyal: loyal, loyal_since: loyal ? "2000-12-27T10:00:00Z" : null },
              { onConflict: "phone_e164" },
            )
            .select("id")
            .single(),
        )
      ).id;
    const c1 = await client("+212699000001", "KPI Client Fidèle", true);
    const c2 = await client("+212699000002", "KPI Client Régulier", false);
    const c3 = await client("+212699000003", "KPI Client Annulé", false);

    // --- orders ---
    let slip = 900000;
    const order = async (row: OrderInsert) =>
      (await one(s.from("orders").insert({ store_id: tsk, slip_number: ++slip, ...row }).select("id").single())).id;
    const o1 = await order({
      client_id: c1, subtotal: 1000, discount_amount: 100, discount_source: "admin_free", frame_revenue: 400, lens_type_id: unifocal,
      status: "delivered", created_at: "2001-01-10T09:15:00Z", delivered_at: "2001-01-17T09:15:00Z",
    });
    const o2 = await order({ client_id: c1, subtotal: 600, client_own_frame: true, lens_type_id: unifocal, status: "in_store", created_at: "2001-01-15T14:30:00Z" });
    const o3 = await order({ client_id: c2, subtotal: 800, frame_revenue: 300, lens_type_id: progressive, status: "confirmed", created_at: "2001-01-20T11:00:00Z" });
    const o4 = await order({ client_id: c3, subtotal: 500, status: "cancelled", created_at: "2001-01-22T16:00:00Z", cancelled_at: "2001-01-23T10:00:00Z" });
    const o5 = await order({ client_id: c2, subtotal: 300, status: "delivered", created_at: "2000-12-05T10:00:00Z", delivered_at: "2000-12-10T10:00:00Z" });
    const o7 = await order({ client_id: c1, subtotal: 250, status: "delivered", created_at: "2000-12-20T10:00:00Z", delivered_at: "2000-12-27T10:00:00Z" });
    await order({ client_id: c3, subtotal: 200, status: "confirmed", created_at: "2001-02-03T10:00:00Z" });
    const o8 = await order({ client_id: c2, subtotal: 400, status: "cancelled", created_at: "2001-02-10T10:00:00Z", cancelled_at: "2001-02-12T10:00:00Z" });
    const o9 = await order({ client_id: c2, subtotal: 300, status: "cancelled", created_at: "2001-02-20T10:00:00Z", cancelled_at: "2001-03-02T10:00:00Z" });
    ids = { o1, o2, o3, o4 };

    await one(s.from("order_items").insert([
      { order_id: o1, category_id: catA, qty: 1, unit_price: 400 },
      { order_id: o3, category_id: catB, qty: 1, unit_price: 300 },
    ]).select("order_id"));
    await one(s.from("order_treatments").insert([
      { order_id: o1, treatment_id: antiReflet },
      { order_id: o1, treatment_id: blue },
      { order_id: o2, treatment_id: antiReflet },
    ]).select("order_id"));
    await one(s.from("order_status_history").insert([
      { order_id: o1, from_status: null, to_status: "confirmed", changed_at: "2001-01-10T09:15:00Z" },
      { order_id: o1, from_status: "confirmed", to_status: "in_workshop", changed_at: "2001-01-12T09:15:00Z" },
      { order_id: o1, from_status: "in_workshop", to_status: "prepared", changed_at: "2001-01-13T09:15:00Z" },
      { order_id: o1, from_status: "prepared", to_status: "in_store", changed_at: "2001-01-14T09:15:00Z" },
      { order_id: o1, from_status: "in_store", to_status: "delivered", changed_at: "2001-01-17T09:15:00Z" },
      { order_id: o2, from_status: "prepared", to_status: "in_store", changed_at: "2001-01-17T14:30:00Z" },
    ]).select("order_id"));
    await one(s.from("payments").insert([
      { order_id: o1, amount: 500, kind: "deposit", method_id: cash, received_at: "2001-01-10T10:00:00Z" },
      { order_id: o1, amount: 400, kind: "balance", method_id: cash, received_at: "2001-01-17T09:00:00Z" },
      { order_id: o2, amount: 200, kind: "deposit", method_id: cash, received_at: "2001-01-15T14:40:00Z" },
      { order_id: o4, amount: 100, kind: "deposit", method_id: cash, received_at: "2001-01-22T16:05:00Z" },
      { order_id: o4, amount: -100, kind: "refund", method_id: cash, received_at: "2001-01-23T10:00:00Z" },
      { order_id: o5, amount: 300, kind: "deposit", method_id: cash, received_at: "2000-12-05T10:00:00Z" },
      { order_id: o7, amount: 250, kind: "deposit", method_id: cash, received_at: "2000-12-20T10:00:00Z" },
      { order_id: o8, amount: 150, kind: "deposit", method_id: cash, received_at: "2001-02-10T10:05:00Z" },
      { order_id: o9, amount: 300, kind: "deposit", method_id: cash, received_at: "2001-02-20T10:05:00Z" },
      { order_id: o9, amount: -300, kind: "refund", method_id: cash, received_at: "2001-03-02T10:00:00Z" },
    ]).select("id"));

    // --- purchase (created once: supplier-payment charges are read-only, so never deleted) ---
    const existing = await one(s.from("purchases").select("id").eq("receive_store_id", tsk).limit(1));
    if (!existing.length) {
      const supplier = (await one(s.from("suppliers").upsert({ name: "Fournisseur KPI" }, { onConflict: "id" }).select("id").single())).id;
      const { error } = await f.admin.rpc("create_purchase", {
        payload: {
          supplier_id: supplier,
          receive_store_id: tsk,
          lines: [{ kind: "stock", category_id: catA, unit_price: 100, qty: 2 }],
          payment: { amount: 50, method_id: cash },
        },
      });
      if (error) throw error;
    }
    await one(s.from("stock_movements").insert({ store_id: tsk, category_id: catA, qty_delta: -1, kind: "damage", reason: "KPI fixture", created_at: "2001-01-20T10:00:00Z" }).select("id"));

    // --- charges ---
    const location = async (filter: { store_id?: string; is_general?: boolean }) => {
      let q = s.from("charge_locations").select("id");
      q = filter.store_id ? q.eq("store_id", filter.store_id) : q.eq("is_general", true);
      return (await one(q.limit(1).single())).id;
    };
    const [tskLoc, generalLoc, tsbLoc, labLoc] = await Promise.all([
      location({ store_id: tsk }), location({ is_general: true }), location({ store_id: f.storeB }), location({ store_id: lab }),
    ]);
    const rent = f.ids.rentCategory;
    const charge = (amount: number, location_id: string, charge_date: string, extra: Record<string, unknown> = {}) => ({
      amount, location_id, charge_date, category_id: rent, reason: `KPI fixture ${amount}`, ...extra,
    });
    await one(s.from("charges").insert([
      charge(300, tskLoc, "2001-01-05"),
      charge(999, tskLoc, "2001-01-06", { status: "pending" }),
      charge(444, tskLoc, "2001-01-07", { is_deleted: true, deleted_at: "2001-01-08T10:00:00Z" }),
      charge(200, generalLoc, "2001-01-08"),
      charge(150, tsbLoc, "2001-01-09"),
      charge(120, labLoc, "2001-01-10"),
      charge(50, tskLoc, "2000-12-15"),
    ], { defaultToNull: false }).select("id"));
  });

  afterAll(async () => {
    if (!tsk || !f) return;
    await removeFixture();
    await restoreTsk?.();
    await f.cleanup();
  });

  describe("store TSK, January 2001", () => {
    let k: Record<string, number | null>;
    beforeAll(async () => {
      k = await summary(f.admin, JAN, tsk);
    });

    it("CA = sum of non-cancelled totals (after discount)", () => expect(k.revenue).toBe(2300));
    it("orders = non-cancelled orders; average basket = CA / orders", () => {
      expect(k.orders).toBe(3);
      expect(k.avg_basket).toBe(766.67);
    });
    it("montant encaissé = payments by received date, refunds negative, cancelled orders included", () => expect(k.collected).toBe(1100));
    it("charges = approved, not deleted, at the store's location only", () => expect(k.charges).toBe(300));
    it("NET = CA − charges", () => expect(k.net).toBe(2000));
    it("reste à encaisser = what is left on non-cancelled, non-delivered orders of the period", () => expect(k.balance_to_collect).toBe(1200));
    it("remises = sum of discounts", () => expect(k.discounts).toBe(100));
    it("taux d'annulation = cancelled / all orders created", () => {
      expect([k.created, k.cancelled, k.cancellation_rate]).toEqual([4, 1, 0.25]);
    });
    it("montures cassées = frames damaged (count)", () => expect(k.damaged_frames).toBe(1));
    it("dû aux fournisseurs = remaining on purchases received at the store, all time", () => expect(k.owed_to_suppliers).toBe(150));
    it("clients: served, loyal among them, repeat rate (≥ 2 delivered orders, all time)", () => {
      expect([k.served_clients, k.loyal_clients, k.repeat_rate]).toEqual([2, 1, 0.5]);
    });
    it("temps atelier: created → in store, created → delivered (days)", () => {
      expect([k.workshop_days_in_store, k.workshop_days_delivered]).toEqual([3, 7]);
    });
    it("charges en attente: count and amount at the store's locations", () => {
      expect([k.pending_charges_count, k.pending_charges_amount]).toEqual([1, 999]);
    });
  });

  it("'Général' and other stores' charges count only under All stores; the lab keeps its own", async () => {
    expect((await summary(f.admin, JAN, null)).charges).toBe(300 + 200 + 150 + 120);
    expect((await summary(f.admin, JAN, f.storeB)).charges).toBe(150);
    expect((await summary(f.admin, JAN, lab)).charges).toBe(120);
    const { data } = await f.admin.rpc("kpi_breakdown", { p_from: JAN.from, p_to: JAN.to });
    expect((data as { general_charges: number }).general_charges).toBe(200);
  });

  describe("cancelled orders (SPEC §9 as written: a cancelled order leaves the CA, its money stays in 'collected')", () => {
    it("cancelled WITHOUT refund (O8): out of CA, orders and NET; the kept deposit shows only in Montant encaissé", async () => {
      const k = await summary(f.admin, { from: "2001-02-01", to: "2001-02-28" }, tsk);
      expect([k.revenue, k.orders, k.net, k.balance_to_collect]).toEqual([200, 1, 200, 200]); // O6 only
      expect(k.collected).toBe(150 + 300); // O8 kept deposit + O9 paid in February (refunded in March)
      expect([k.created, k.cancelled, k.cancellation_rate]).toEqual([3, 2, 0.6667]);
    });

    it("refund in a later month (O9): February keeps the payment, March gets the negative refund", async () => {
      const k = await summary(f.admin, { from: "2001-03-01", to: "2001-03-31" }, tsk);
      expect([k.revenue, k.orders, k.created, k.collected, k.net]).toEqual([0, 0, 0, -300, 0]);
    });
  });

  it("comparison period: the same formulas on December 2000", async () => {
    const k = await summary(f.admin, DEC, tsk);
    expect([k.revenue, k.orders, k.collected, k.charges, k.net]).toEqual([550, 2, 550, 50, 500]);
  });

  it("time series add up to the summary: per day (zero-filled), per hour, per month", async () => {
    const days = await f.admin.rpc("kpi_timeseries", { p_from: JAN.from, p_to: JAN.to, p_store_id: tsk });
    const d = days.data as { bucket: string; points: { at: string; revenue: number; collected: number; charges: number; net: number; orders: number }[] };
    expect(d.bucket).toBe("day");
    expect(d.points).toHaveLength(31);
    const sum = (key: "revenue" | "collected" | "charges" | "net" | "orders") => Math.round(d.points.reduce((s, p) => s + p[key], 0) * 100) / 100;
    expect([sum("revenue"), sum("collected"), sum("charges"), sum("net"), sum("orders")]).toEqual([2300, 1100, 300, 2000, 3]);
    expect(d.points.find((p) => p.at === "2001-01-15")).toMatchObject({ revenue: 600, collected: 200, orders: 1 });
    expect(d.points.find((p) => p.at === "2001-01-02")).toMatchObject({ revenue: 0, collected: 0, orders: 0 });

    const hours = await f.admin.rpc("kpi_timeseries", { p_from: "2001-01-10", p_to: "2001-01-10" });
    const h = hours.data as typeof d;
    expect([h.bucket, h.points.length]).toEqual(["hour", 24]);
    expect(h.points.find((p) => p.at === "09")).toMatchObject({ revenue: 900, orders: 1 });
    expect(h.points.find((p) => p.at === "10")).toMatchObject({ collected: 500 });
    expect(h.points.find((p) => p.at === "00")).toMatchObject({ charges: 120 }); // lab charge of the day, first hour

    const months = await f.admin.rpc("kpi_timeseries", { p_from: "2001-01-01", p_to: "2001-12-31", p_store_id: tsk });
    const m = months.data as typeof d;
    expect([m.bucket, m.points.length]).toEqual(["month", 12]);
    expect(m.points.slice(0, 3).map((p) => p.revenue)).toEqual([2300, 200, 0]);
  });

  it("breakdown: by store, frame categories, treatments, lens types, segments, busiest hours, lead times", async () => {
    const { data, error } = await f.admin.rpc("kpi_breakdown", { p_from: JAN.from, p_to: JAN.to, p_store_id: tsk });
    expect(error).toBeNull();
    const b = data as Record<string, unknown>;
    expect(b.stores).toEqual([{ store_id: tsk, name: "Test KPI", kind: "store", revenue: 2300, orders: 3, collected: 1100, charges: 300, net: 2000 }]);
    expect(b.general_charges).toBeNull();
    expect(b.frame_categories).toEqual([
      { name: "KPI Monture A", count: 1, revenue: 400 },
      { name: "KPI Monture B", count: 1, revenue: 300 },
    ]);
    expect(b.own_frames).toBe(1);
    expect((b.treatments as { label_fr: string; count: number }[]).map((t) => [t.label_fr, t.count])).toEqual([["Anti-reflet", 2], ["Bleu (lumière bleue)", 1]]);
    expect((b.lens_types as { label_fr: string; count: number }[]).map((t) => [t.label_fr, t.count])).toEqual([["Unifocal", 2], ["Progressif", 1]]);
    expect(b.segments).toEqual({ new: 0, regular: 1, loyal: 1 });
    expect(b.heatmap).toEqual([
      { dow: 1, hour: 14, orders: 1 }, // Mon 15 Jan
      { dow: 3, hour: 9, orders: 1 }, // Wed 10 Jan
      { dow: 6, hour: 11, orders: 1 }, // Sat 20 Jan
    ]);
    expect(b.lead_times).toEqual([{ name: "Test KPI", to_in_store: 3, to_delivered: 7, measured: 2 }]);
  });

  it("rejects a reversed range and every role but the super admin", async () => {
    expectDbError((await f.admin.rpc("kpi_summary", { p_from: "2001-02-01", p_to: "2001-01-01" })).error, "INVALID_INPUT");
    for (const fn of ["kpi_summary", "kpi_timeseries", "kpi_breakdown"] as const) {
      expectDbError((await f.secretary.rpc(fn, { p_from: JAN.from, p_to: JAN.to })).error, "FORBIDDEN");
    }
    expect(ids.o1).toBeTruthy();
  });
});
