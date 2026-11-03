import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "@/types/database";
import { expectDbError, hasDbEnv, setupFixtures, type Fixtures } from "./fixtures";

/** Purchasing page (phase 8): totals, payments ≤ remaining, one read-only charge per payment, scope. */
describe.skipIf(!hasDbEnv)("purchasing", () => {
  let f: Fixtures;
  let lab: string;
  const suppliers: string[] = [];
  const runId = Date.now().toString(36);

  beforeAll(async () => {
    f = await setupFixtures();
    const { data, error } = await f.admin.from("stores").select("id").eq("kind", "lab").eq("is_active", true).single();
    if (error) throw error;
    lab = data.id;
  });

  afterAll(async () => {
    if (suppliers.length) await f?.admin.from("suppliers").update({ is_archived: true }).in("id", suppliers);
    await f?.cleanup();
  });

  async function newSupplier(label: string): Promise<string> {
    const { data, error } = await f.admin.from("suppliers").insert({ name: `Fournisseur ${label} ${runId}` }).select("id").single();
    if (error) throw error;
    suppliers.push(data.id);
    return data.id;
  }

  async function purchase(payload: Record<string, unknown>): Promise<string> {
    const { data, error } = await f.admin.rpc("create_purchase", { payload: payload as Json });
    if (error) throw error;
    return data as string;
  }

  async function overview(id: string) {
    const { data, error } = await f.admin.from("purchase_overview").select("total, paid, remaining, line_count, stock_qty").eq("id", id).single();
    if (error) throw error;
    return data;
  }

  const pay = (purchaseId: string, amount: number) =>
    f.admin.rpc("add_supplier_payment", { p_purchase_id: purchaseId, p_amount: amount, p_method_id: f.ids.cash });

  it("a purchase received at the lab: stock lines move stock there, lens lines don't; totals summed in SQL", async () => {
    const supplier = await newSupplier("lab");
    const category = await f.newFrameCategory("purchase-lab");
    const id = await purchase({
      supplier_id: supplier,
      receive_store_id: lab,
      supplier_ref: "BL-42",
      lines: [
        { kind: "stock", category_id: category, unit_price: 123.45, qty: 3 },
        { kind: "lens", description: "Verres progressifs", amount: 864.12 },
      ],
    });

    expect(await overview(id)).toEqual({ total: 1234.47, paid: 0, remaining: 1234.47, line_count: 2, stock_qty: 3 });
    expect(await f.stockOf(f.admin, lab, category)).toBe(3);
    const { data: moves } = await f.admin.from("stock_movements").select("store_id, qty_delta, kind").eq("ref_id", id);
    expect(moves).toEqual([{ store_id: lab, qty_delta: 3, kind: "purchase" }]);
  });

  it("each supplier payment creates exactly one approved, read-only charge at the receive location", async () => {
    const supplier = await newSupplier("charge");
    const id = await purchase({
      supplier_id: supplier,
      receive_store_id: lab,
      lines: [{ kind: "lens", description: "Verres", amount: 1000 }],
      payment: { amount: 300, method_id: f.ids.cash, paid_at: "2026-11-01" },
    });
    expect(await overview(id)).toMatchObject({ paid: 300, remaining: 700 });

    const { data: payments } = await f.admin.from("supplier_payments").select("id").eq("purchase_id", id);
    expect(payments).toHaveLength(1);
    const { data: charges } = await f.admin
      .from("charges")
      .select("id, amount, charge_date, status, reason, category_id, location_id")
      .eq("supplier_payment_id", payments![0].id);
    expect(charges).toHaveLength(1);
    const charge = charges![0];
    expect(charge).toMatchObject({ amount: 300, charge_date: "2026-11-01", status: "approved", reason: `Paiement fournisseur — Fournisseur charge ${runId}` });

    const { data: category } = await f.admin.from("settings_list_items").select("code").eq("id", charge.category_id).single();
    expect(category?.code).toBe("supplier_purchase");
    const { data: location } = await f.admin.from("charge_locations").select("store_id").eq("id", charge.location_id).single();
    expect(location?.store_id).toBe(lab);

    expectDbError((await f.admin.from("charges").update({ amount: 1 }).eq("id", charge.id)).error, "CHARGE_READ_ONLY");
  });

  it("payments never exceed the total, even in parallel", async () => {
    const supplier = await newSupplier("cap");
    const id = await purchase({ supplier_id: supplier, receive_store_id: f.storeA, lines: [{ kind: "lens", description: "Verres", amount: 500 }] });

    expectDbError((await pay(id, 0)).error, "INVALID_INPUT");
    expectDbError((await pay(id, 500.01)).error, "AMOUNT_TOO_HIGH");

    const results = await Promise.all([pay(id, 300), pay(id, 300)]);
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expectDbError(results.find((r) => r.error)!.error, "AMOUNT_TOO_HIGH");
    expect(await overview(id)).toMatchObject({ paid: 300, remaining: 200 });

    expect((await pay(id, 200)).error).toBeNull();
    expect(await overview(id)).toMatchObject({ paid: 500, remaining: 0 });
    expectDbError((await pay(id, 0.01)).error, "AMOUNT_TOO_HIGH");

    const { count } = await f.admin
      .from("charges")
      .select("id, supplier_payments!inner(purchase_id)", { count: "exact", head: true })
      .eq("supplier_payments.purchase_id", id);
    expect(count).toBe(2);
  });

  it("an invalid purchase is rejected as a whole", async () => {
    const supplier = await newSupplier("invalid");
    const archived = await newSupplier("archived");
    await f.admin.from("suppliers").update({ is_archived: true }).eq("id", archived);
    const category = await f.newFrameCategory("purchase-invalid");
    const { count: before } = await f.admin.from("purchases").select("id", { count: "exact", head: true });

    const attempts: Record<string, unknown>[] = [
      { supplier_id: archived, receive_store_id: f.storeA, lines: [{ kind: "lens", description: "Verres", amount: 10 }] },
      { supplier_id: supplier, receive_store_id: f.storeA, lines: [] },
      { supplier_id: supplier, receive_store_id: f.storeA, lines: [{ kind: "lens", description: "  ", amount: 10 }] },
      { supplier_id: supplier, receive_store_id: f.storeA, lines: [{ kind: "stock", category_id: crypto.randomUUID(), unit_price: 10, qty: 1 }] },
      // a good stock line followed by a bad one: nothing is kept
      {
        supplier_id: supplier,
        receive_store_id: f.storeA,
        lines: [
          { kind: "stock", category_id: category, unit_price: 10, qty: 2 },
          { kind: "stock", category_id: category, unit_price: -1, qty: 1 },
        ],
      },
      // payment above the total
      {
        supplier_id: supplier,
        receive_store_id: f.storeA,
        lines: [{ kind: "stock", category_id: category, unit_price: 10, qty: 2 }],
        payment: { amount: 20.01, method_id: f.ids.cash },
      },
    ];
    for (const payload of attempts) {
      const { error } = await f.admin.rpc("create_purchase", { payload: payload as Json });
      expect(error, JSON.stringify(payload)).not.toBeNull();
      expect(error!.message).toMatch(/OPTICOR:(INVALID_INPUT|AMOUNT_TOO_HIGH)/);
    }

    const { count: after } = await f.admin.from("purchases").select("id", { count: "exact", head: true });
    expect(after).toBe(before);
    expect(await f.stockOf(f.admin, f.storeA, category)).toBe(0);
  });

  it("supplier balance owed = sum of what is left to pay on its purchases", async () => {
    const supplier = await newSupplier("owed");
    const a = await purchase({ supplier_id: supplier, receive_store_id: f.storeA, lines: [{ kind: "lens", description: "A", amount: 400 }] });
    await purchase({
      supplier_id: supplier,
      receive_store_id: f.storeB,
      purchase_date: "2026-10-15",
      lines: [{ kind: "lens", description: "B", amount: 250.5 }],
      payment: { amount: 250.5, method_id: f.ids.cash },
    });
    expect((await pay(a, 100)).error).toBeNull();

    const { data } = await f.admin.from("supplier_balances").select("purchases_count, total_bought, paid, owed").eq("supplier_id", supplier).single();
    expect(data).toEqual({ purchases_count: 2, total_bought: 650.5, paid: 350.5, owed: 300 });
  });

  it("the page summary equals the sum of what is left on every purchase", async () => {
    const { data: rows } = await f.admin.from("purchase_overview").select("remaining");
    const cents = (rows ?? []).reduce((s, r) => s + Math.round((r.remaining ?? 0) * 100), 0);
    const { data: summary } = await f.admin.from("purchasing_summary").select("owed, unpaid_count").single();
    expect(Math.round((summary?.owed ?? 0) * 100)).toBe(cents);
    expect(summary?.unpaid_count).toBe((rows ?? []).filter((r) => (r.remaining ?? 0) > 0).length);
  });

  it("two active suppliers can't share a name; an archived one frees it", async () => {
    const first = await newSupplier("dup");
    const clash = await f.admin.from("suppliers").insert({ name: `  fournisseur DUP ${runId} ` }).select("id").single();
    expect(clash.error?.code).toBe("23505");

    await f.admin.from("suppliers").update({ is_archived: true }).eq("id", first);
    const again = await f.admin.from("suppliers").insert({ name: `Fournisseur dup ${runId}` }).select("id").single();
    expect(again.error).toBeNull();
    suppliers.push(again.data!.id);
  });

  it("secretary: no purchases, suppliers or balances, no writes", async () => {
    const { data: summary } = await f.secretary.from("purchasing_summary").select("owed, unpaid_count, total_bought").single();
    expect(summary).toEqual({ owed: 0, unpaid_count: 0, total_bought: 0 });
    for (const view of ["purchase_overview", "supplier_balances"] as const) {
      const { data, error } = await f.secretary.from(view).select("*").limit(5);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
    expectDbError(
      (await f.secretary.rpc("add_supplier_payment", { p_purchase_id: crypto.randomUUID(), p_amount: 1, p_method_id: f.ids.cash })).error,
      "FORBIDDEN",
    );
    const insert = await f.secretary.from("suppliers").insert({ name: `Interdit ${runId}` }).select("id");
    expect(insert.error).not.toBeNull();
  });
});
