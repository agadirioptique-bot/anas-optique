import { beforeAll, describe, expect, it } from "vitest";
import type { Json } from "@/types/database";
import { expectDbError, hasDbEnv, ownFrameOrder, setupFixtures, type Db, type Fixtures } from "./fixtures";

type Created = { order_id: string; display_number: string };

/** SPEC §6 business rules, run against DEV through the real RPCs. */
describe.skipIf(!hasDbEnv)("business rules (RPCs + triggers)", () => {
  let f: Fixtures;

  beforeAll(async () => {
    f = await setupFixtures();
  });

  async function createOrder(client: Db, payload: ReturnType<typeof ownFrameOrder>): Promise<Created> {
    const { data, error } = await client.rpc("create_order", { payload: payload as Json });
    if (error) throw error;
    return data as Created;
  }

  async function moveTo(client: Db, orderId: string, steps: ("in_workshop" | "prepared" | "in_store")[]) {
    for (const step of steps) {
      const { error } = await client.rpc("change_order_status", { p_order_id: orderId, p_to_status: step });
      if (error) throw error;
    }
  }

  it("cannot sell a frame with 0 stock; stock never goes negative", async () => {
    const category = await f.newFrameCategory("nostock");
    const payload = (slip = f.nextSlip()) =>
      ownFrameOrder(f, f.storeA, { slip_number: slip, client_own_frame: false, items: [{ category_id: category, qty: 1 }] });

    expectDbError((await f.secretary.rpc("create_order", { payload: payload() })).error, "NO_STOCK");

    await f.addStock(f.storeA, category, 1);
    const sold = await createOrder(f.secretary, payload());
    expect(sold.display_number).toMatch(/^TSA-\d+$/);
    expect(await f.stockOf(f.secretary, f.storeA, category)).toBe(0);
    expectDbError((await f.secretary.rpc("create_order", { payload: payload() })).error, "NO_STOCK");

    expectDbError(
      (await f.admin.rpc("record_damage", { p_store_id: f.storeA, p_category_id: category, p_qty: 1, p_reason: "Cassée" })).error,
      "NO_STOCK",
    );
    expectDbError(
      (await f.admin.rpc("create_transfer", { p_from_store_id: f.storeA, p_to_store_id: f.storeB, p_lines: [{ category_id: category, qty: 1 }] })).error,
      "NO_STOCK",
    );
  });

  it("stock level always equals the sum of its movements", async () => {
    const category = await f.newFrameCategory("ledger");
    await f.addStock(f.storeA, category, 5);
    const transfer = await f.admin.rpc("create_transfer", {
      p_from_store_id: f.storeA,
      p_to_store_id: f.storeB,
      p_lines: [{ category_id: category, qty: 2 }],
    });
    expect(transfer.error).toBeNull();
    expect((await f.admin.rpc("record_damage", { p_store_id: f.storeA, p_category_id: category, p_qty: 1, p_reason: "Rayée" })).error).toBeNull();
    expect(
      (await f.admin.rpc("adjust_stock", { p_store_id: f.storeA, p_category_id: category, p_counted_qty: 1, p_reason_id: f.ids.adjustReason })).error,
    ).toBeNull();

    for (const store of [f.storeA, f.storeB]) {
      const { data: moves } = await f.admin.from("stock_movements").select("qty_delta").eq("store_id", store).eq("category_id", category);
      const sum = (moves ?? []).reduce((s, m) => s + m.qty_delta, 0);
      expect(await f.stockOf(f.admin, store, category)).toBe(sum);
    }
    expect(await f.stockOf(f.admin, f.storeA, category)).toBe(1);
    expect(await f.stockOf(f.admin, f.storeB, category)).toBe(2);
  });

  it("a duplicate slip is rejected and the super admins are notified once", async () => {
    const first = ownFrameOrder(f, f.storeA);
    const created = await createOrder(f.secretary, first);

    const again = await f.secretary.rpc("create_order", { payload: first });
    const result = again.data as { error?: string; existing?: { order_id: string; display: string } };
    expect(again.error).toBeNull();
    expect(result.error).toBe("DUPLICATE_SLIP");
    expect(result.existing?.order_id).toBe(created.order_id);
    expect(result.existing?.display).toBe(created.display_number);

    const { data: notes } = await f.admin
      .from("notifications")
      .select("id, params")
      .eq("kind", "duplicate_slip_blocked")
      .contains("params", { order_id: created.order_id });
    expect(notes).toHaveLength(1);
  });

  it("delivery is blocked while a balance is due", async () => {
    const order = await createOrder(f.secretary, ownFrameOrder(f, f.storeA, { deposit: { amount: 100, method_id: f.ids.cash } }));
    expectDbError((await f.secretary.rpc("deliver_order", { p_order_id: order.order_id })).error, "INVALID_STATUS_CHANGE");
    await moveTo(f.secretary, order.order_id, ["in_workshop", "prepared", "in_store"]);

    expectDbError((await f.secretary.rpc("deliver_order", { p_order_id: order.order_id })).error, "BALANCE_DUE");
    expectDbError(
      (await f.secretary.rpc("change_order_status", { p_order_id: order.order_id, p_to_status: "delivered" })).error,
      "BALANCE_DUE",
    );
    expectDbError(
      (await f.secretary.rpc("add_payment", { p_order_id: order.order_id, p_amount: 301, p_method_id: f.ids.cash })).error,
      "AMOUNT_TOO_HIGH",
    );

    const delivered = await f.secretary.rpc("deliver_order", {
      p_order_id: order.order_id,
      p_final_payment: { amount: 300, method_id: f.ids.cash },
    });
    expect(delivered.error).toBeNull();
    const { data: balance } = await f.secretary.from("order_balances").select("status, balance").eq("order_id", order.order_id).single();
    expect(balance).toEqual({ status: "delivered", balance: 0 });
    expectDbError(
      (await f.admin.rpc("change_order_status", { p_order_id: order.order_id, p_to_status: "in_store" })).error,
      "INVALID_STATUS_CHANGE",
    );
  });

  it("cancelling restores stock and refunds at most what was paid", async () => {
    const category = await f.newFrameCategory("cancel");
    await f.addStock(f.storeA, category, 2);
    const order = await createOrder(
      f.secretary,
      ownFrameOrder(f, f.storeA, {
        client_own_frame: false,
        items: [{ category_id: category, qty: 1 }],
        deposit: { amount: 150, method_id: f.ids.cash },
      }),
    );
    expect(await f.stockOf(f.admin, f.storeA, category)).toBe(1);

    expectDbError(
      (await f.admin.rpc("cancel_order", {
        p_order_id: order.order_id,
        p_reason_id: f.ids.cancelReason,
        p_refund_amount: 151,
        p_refund_method_id: f.ids.cash,
      })).error,
      "AMOUNT_TOO_HIGH",
    );
    const cancelled = await f.admin.rpc("cancel_order", {
      p_order_id: order.order_id,
      p_reason_id: f.ids.cancelReason,
      p_note: "Test",
      p_refund_amount: 150,
      p_refund_method_id: f.ids.cash,
    });
    expect(cancelled.error).toBeNull();
    expect(await f.stockOf(f.admin, f.storeA, category)).toBe(1 + 1);

    const { data: balance } = await f.admin.from("order_balances").select("status, paid").eq("order_id", order.order_id).single();
    expect(balance).toEqual({ status: "cancelled", paid: 0 });
    expectDbError(
      (await f.admin.rpc("cancel_order", { p_order_id: order.order_id, p_reason_id: f.ids.cancelReason })).error,
      "INVALID_STATUS_CHANGE",
    );
  });

  it("discounts never go below the frame price; a client discount is consumed once", async () => {
    const category = await f.newFrameCategory("discount");
    await f.addStock(f.storeA, category, 2);
    const first = ownFrameOrder(f, f.storeA, { client_own_frame: false, items: [{ category_id: category, qty: 1 }], subtotal: 500 });
    const created = await createOrder(f.secretary, first);
    const { data: order } = await f.admin.from("orders").select("client_id").eq("id", created.order_id).single();

    expectDbError((await f.admin.rpc("apply_free_discount", { p_order_id: created.order_id, p_amount: 301 })).error, "DISCOUNT_TOO_HIGH");
    expect((await f.admin.rpc("apply_free_discount", { p_order_id: created.order_id, p_amount: 50 })).error).toBeNull();

    expect((await f.admin.rpc("set_client_discount", { p_client_id: order!.client_id, p_type: "percent", p_value: 10 })).error).toBeNull();
    const withDiscount = await createOrder(
      f.secretary,
      ownFrameOrder(f, f.storeA, { new_client: undefined, client_id: order!.client_id, apply_client_discount: true, subtotal: 400 }),
    );
    const { data: saved } = await f.admin.from("orders").select("total, discount_source").eq("id", withDiscount.order_id).single();
    expect(saved).toEqual({ total: 360, discount_source: "client_pending" });

    expectDbError(
      (await f.secretary.rpc("create_order", {
        payload: ownFrameOrder(f, f.storeA, { new_client: undefined, client_id: order!.client_id, apply_client_discount: true }),
      })).error,
      "NO_PENDING_DISCOUNT",
    );
  });

  it("a supplier payment creates exactly one read-only charge", async () => {
    const purchase = await f.admin.rpc("create_purchase", {
      payload: {
        supplier_id: f.ids.supplier,
        receive_store_id: f.storeA,
        lines: [{ kind: "lens", description: "Verres progressifs", amount: 800 }],
        payment: { amount: 240, method_id: f.ids.cash },
      },
    });
    expect(purchase.error).toBeNull();
    const purchaseId = purchase.data as string;

    const second = await f.admin.rpc("add_supplier_payment", { p_purchase_id: purchaseId, p_amount: 100, p_method_id: f.ids.cash });
    expect(second.error).toBeNull();
    expectDbError(
      (await f.admin.rpc("add_supplier_payment", { p_purchase_id: purchaseId, p_amount: 461, p_method_id: f.ids.cash })).error,
      "AMOUNT_TOO_HIGH",
    );

    const { data: payments } = await f.admin.from("supplier_payments").select("id, amount").eq("purchase_id", purchaseId);
    expect(payments).toHaveLength(2);
    for (const payment of payments!) {
      const { data: charges } = await f.admin.from("charges").select("id, amount, status").eq("supplier_payment_id", payment.id);
      expect(charges).toHaveLength(1);
      expect(charges![0]).toMatchObject({ amount: payment.amount, status: "approved" });
      const edit = await f.admin.from("charges").update({ amount: 1 }).eq("id", charges![0].id);
      expectDbError(edit.error, "CHARGE_READ_ONLY");
    }
    const { data: balance } = await f.admin.from("purchase_balances").select("remaining").eq("purchase_id", purchaseId).single();
    expect(balance?.remaining).toBe(460);
  });

  it("recurring charges are generated once per month", async () => {
    const { data: location } = await f.admin.from("charge_locations").select("id").eq("store_id", f.storeA).single();
    const { data: recurring, error } = await f.admin
      .from("recurring_charges")
      .insert({ label: `Loyer test ${Date.now()}`, amount: 1000, category_id: f.ids.rentCategory, location_id: location!.id, day_of_month: 1 })
      .select("id")
      .single();
    expect(error).toBeNull();

    try {
      const today = new Date().toISOString().slice(0, 10);
      expect((await f.service.rpc("generate_recurring_charges", { p_date: today })).error).toBeNull();
      expect((await f.service.rpc("generate_recurring_charges", { p_date: today })).error).toBeNull();
      const { data: charges } = await f.admin.from("charges").select("status").eq("recurring_charge_id", recurring!.id);
      expect(charges).toEqual([{ status: "pending" }]);
    } finally {
      // Keep the daily cron from creating more test charges on dev.
      await f.admin.from("recurring_charges").update({ is_active: false }).eq("id", recurring!.id);
    }
  });

  it("a client becomes loyal once, at the threshold", async () => {
    const { data: setting } = await f.admin.from("app_settings").select("value").eq("key", "loyalty_threshold").single();
    const threshold = (setting!.value as { orders: number }).orders;

    const firstOrder = await createOrder(f.secretary, ownFrameOrder(f, f.storeA, { subtotal: 0 }));
    const { data: order } = await f.admin.from("orders").select("client_id").eq("id", firstOrder.order_id).single();
    const clientId = order!.client_id;

    const deliver = async (orderId: string) => {
      await moveTo(f.secretary, orderId, ["in_workshop", "prepared", "in_store"]);
      const { error } = await f.secretary.rpc("deliver_order", { p_order_id: orderId });
      if (error) throw error;
    };
    const loyal = async () => (await f.admin.from("clients").select("is_loyal").eq("id", clientId).single()).data!.is_loyal;
    const loyaltyNotes = async () =>
      (await f.admin.from("notifications").select("id").eq("dedupe_key", `client_became_loyal:${clientId}`)).data!.length;

    await deliver(firstOrder.order_id);
    for (let i = 2; i <= threshold + 1; i++) {
      expect(await loyal(), `after ${i - 1} delivered`).toBe(i - 1 >= threshold);
      const next = await createOrder(f.secretary, ownFrameOrder(f, f.storeA, { new_client: undefined, client_id: clientId, subtotal: 0 }));
      await deliver(next.order_id);
    }
    expect(await loyal()).toBe(true);
    expect(await loyaltyNotes()).toBe(1);
    const secretaryNotes = await f.secretary.from("notifications").select("id").eq("dedupe_key", `client_became_loyal:${clientId}`);
    expect(secretaryNotes.data).toHaveLength(1);
  });
});
