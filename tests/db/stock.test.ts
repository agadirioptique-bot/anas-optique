import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "@/types/database";
import { expectDbError, hasDbEnv, ownFrameOrder, setupFixtures, type Db, type Fixtures } from "./fixtures";

/** Stock page (phase 7): ledger invariant, overview / history views, role scope. */
describe.skipIf(!hasDbEnv)("stock", () => {
  let f: Fixtures;

  beforeAll(async () => {
    f = await setupFixtures();
  });

  afterAll(async () => {
    await f?.cleanup();
  });

  async function movementSum(storeId: string, categoryId: string) {
    const { data, error } = await f.admin.from("stock_movements").select("qty_delta").eq("store_id", storeId).eq("category_id", categoryId);
    if (error) throw error;
    return data.reduce((s, m) => s + m.qty_delta, 0);
  }

  async function overviewQty(client: Db, storeId: string, categoryId: string) {
    const { data, error } = await client
      .from("stock_overview")
      .select("quantity")
      .eq("store_id", storeId)
      .eq("category_id", categoryId)
      .maybeSingle();
    if (error) throw error;
    return data?.quantity ?? null;
  }

  async function lastBalance(client: Db, storeId: string, categoryId: string) {
    const { data, error } = await client
      .from("stock_movement_history")
      .select("balance_after")
      .eq("store_id", storeId)
      .eq("category_id", categoryId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.balance_after ?? 0;
  }

  async function expectConsistent(storeId: string, categoryId: string, expected: number) {
    const sum = await movementSum(storeId, categoryId);
    expect(sum).toBe(expected);
    expect(await f.stockOf(f.admin, storeId, categoryId)).toBe(sum);
    expect(await overviewQty(f.admin, storeId, categoryId)).toBe(sum);
    expect(await lastBalance(f.admin, storeId, categoryId)).toBe(sum);
    expect(sum).toBeGreaterThanOrEqual(0);
  }

  it("a mixed sequence of movements keeps level = sum of movements, never negative", async () => {
    const category = await f.newFrameCategory("sequence");
    const stores = [f.storeA, f.storeB];
    const model = new Map(stores.map((s) => [s, 0]));
    // Deterministic pseudo-random sequence (LCG) so a failure can be replayed.
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const orders: string[] = [];

    for (let step = 0; step < 24; step++) {
      const store = stores[rand(2)];
      const other = store === f.storeA ? f.storeB : f.storeA;
      const have = model.get(store)!;
      const op = rand(6);
      if (op === 0 || have === 0) {
        const qty = 1 + rand(4);
        await f.addStock(store, category, qty);
        model.set(store, have + qty);
      } else if (op === 1) {
        // Sometimes ask for more than available: rejected as a whole.
        const qty = 1 + rand(have + 2);
        const { error } = await f.admin.rpc("create_transfer", {
          p_from_store_id: store,
          p_to_store_id: other,
          p_lines: [{ category_id: category, qty }],
        });
        if (qty > have) expectDbError(error, "NO_STOCK");
        else {
          expect(error).toBeNull();
          model.set(store, have - qty);
          model.set(other, model.get(other)! + qty);
        }
      } else if (op === 2) {
        const qty = 1 + rand(have + 1);
        const { error } = await f.admin.rpc("record_damage", { p_store_id: store, p_category_id: category, p_qty: qty, p_reason: "Test" });
        if (qty > have) expectDbError(error, "NO_STOCK");
        else {
          expect(error).toBeNull();
          model.set(store, have - qty);
        }
      } else if (op === 3) {
        const counted = rand(have + 3);
        const { error } = await f.admin.rpc("adjust_stock", {
          p_store_id: store,
          p_category_id: category,
          p_counted_qty: counted,
          p_reason_id: f.ids.adjustReason,
        });
        expect(error).toBeNull();
        model.set(store, counted);
      } else if (op === 4 && store === f.storeA) {
        const { data, error } = await f.secretary.rpc("create_order", {
          payload: ownFrameOrder(f, f.storeA, { client_own_frame: false, items: [{ category_id: category, qty: 1 }] }) as Json,
        });
        expect(error).toBeNull();
        orders.push((data as { order_id: string }).order_id);
        model.set(store, have - 1);
      } else if (orders.length) {
        const { error } = await f.admin.rpc("cancel_order", { p_order_id: orders.pop()!, p_reason_id: f.ids.cancelReason });
        expect(error).toBeNull();
        model.set(f.storeA, model.get(f.storeA)! + 1);
      }
    }

    for (const store of stores) await expectConsistent(store, category, model.get(store)!);
  });

  it("a transfer with one short line is rejected as a whole", async () => {
    const a = await f.newFrameCategory("tr-ok");
    const b = await f.newFrameCategory("tr-short");
    await f.addStock(f.storeA, a, 3);
    await f.addStock(f.storeA, b, 1);
    const { count: before } = await f.admin.from("transfers").select("id", { count: "exact", head: true });

    const { error } = await f.admin.rpc("create_transfer", {
      p_from_store_id: f.storeA,
      p_to_store_id: f.storeB,
      p_lines: [
        { category_id: a, qty: 2 },
        { category_id: b, qty: 2 },
      ],
    });
    expectDbError(error, "NO_STOCK");

    const { count: after } = await f.admin.from("transfers").select("id", { count: "exact", head: true });
    expect(after).toBe(before);
    await expectConsistent(f.storeA, a, 3);
    await expectConsistent(f.storeA, b, 1);
    expect(await movementSum(f.storeB, a)).toBe(0);
  });

  it("adjust sets the exact counted quantity and validates its input", async () => {
    const category = await f.newFrameCategory("adjust");
    await f.addStock(f.storeA, category, 4);
    const adjust = (counted: number, reason: string | null = f.ids.adjustReason) =>
      f.admin.rpc("adjust_stock", {
        p_store_id: f.storeA,
        p_category_id: category,
        p_counted_qty: counted,
        p_reason_id: reason as string,
      });

    expectDbError((await adjust(-1)).error, "INVALID_INPUT");
    expectDbError((await adjust(2, null)).error, "INVALID_INPUT");
    expect((await adjust(7)).error).toBeNull();
    await expectConsistent(f.storeA, category, 7);
    expect((await adjust(0)).error).toBeNull();
    await expectConsistent(f.storeA, category, 0);

    const { data: last } = await f.admin
      .from("stock_movement_history")
      .select("kind, qty_delta, balance_after, reason_label_fr")
      .eq("store_id", f.storeA)
      .eq("category_id", category)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(last).toMatchObject({ kind: "adjustment", qty_delta: -7, balance_after: 0 });
    expect(last?.reason_label_fr).toBeTruthy();
  });

  it("damage requires a reason and a positive quantity", async () => {
    const category = await f.newFrameCategory("damage");
    await f.addStock(f.storeA, category, 2);
    const damage = (qty: number, reason: string) =>
      f.admin.rpc("record_damage", { p_store_id: f.storeA, p_category_id: category, p_qty: qty, p_reason: reason });

    expectDbError((await damage(1, "  ")).error, "INVALID_INPUT");
    expectDbError((await damage(0, "Cassée")).error, "INVALID_INPUT");
    expectDbError((await damage(3, "Cassée")).error, "NO_STOCK");
    expect((await damage(2, "Cassée")).error).toBeNull();
    await expectConsistent(f.storeA, category, 0);
  });

  it("two concurrent removals of the last unit: exactly one succeeds", async () => {
    const category = await f.newFrameCategory("race");
    await f.addStock(f.storeA, category, 1);
    const results = await Promise.all(
      [1, 2].map(() => f.admin.rpc("record_damage", { p_store_id: f.storeA, p_category_id: category, p_qty: 1, p_reason: "Race" })),
    );
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expectDbError(results.find((r) => r.error)!.error, "NO_STOCK");
    await expectConsistent(f.storeA, category, 0);
  });

  it("a movement inserted outside the RPCs still cannot make stock negative", async () => {
    const category = await f.newFrameCategory("guard");
    const { error } = await f.service
      .from("stock_movements")
      .insert({ store_id: f.storeA, category_id: category, qty_delta: -1, kind: "damage", reason: "Bypass" });
    expectDbError(error, "NO_STOCK");
    expect(await movementSum(f.storeA, category)).toBe(0);
  });

  it("no location holds a negative quantity anywhere", async () => {
    const { data, error } = await f.admin.from("stock_levels").select("store_id, category_id, quantity").lt("quantity", 0);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("the overview lists active categories at 0 and hides archived ones without stock", async () => {
    const empty = await f.newFrameCategory("empty");
    const archived = await f.newFrameCategory("archived");
    const archivedWithStock = await f.newFrameCategory("archived-stock");
    await f.addStock(f.storeA, archivedWithStock, 1);
    await f.admin.from("product_categories").update({ is_archived: true }).in("id", [archived, archivedWithStock]);

    expect(await overviewQty(f.admin, f.storeA, empty)).toBe(0);
    expect(await overviewQty(f.admin, f.storeA, archived)).toBeNull();
    expect(await overviewQty(f.admin, f.storeA, archivedWithStock)).toBe(1);
  });

  it("secretary: own store only, read only, no transfer details, no money", async () => {
    const category = await f.newFrameCategory("scope");
    await f.addStock(f.storeA, category, 3);
    await f.addStock(f.storeB, category, 2);
    expect(
      (await f.admin.rpc("create_transfer", { p_from_store_id: f.storeA, p_to_store_id: f.storeB, p_lines: [{ category_id: category, qty: 1 }] }))
        .error,
    ).toBeNull();

    const { data: rows } = await f.secretary.from("stock_overview").select("*").eq("category_id", category);
    expect(rows?.map((r) => r.store_id)).toEqual([f.storeA]);
    expect(rows?.[0].quantity).toBe(2);
    for (const key of Object.keys(rows?.[0] ?? {})) expect(key).not.toMatch(/price|cost|value|amount/);

    const { data: other } = await f.secretary.from("stock_movement_history").select("id").eq("store_id", f.storeB).eq("category_id", category);
    expect(other).toEqual([]);

    const { data: mine } = await f.secretary
      .from("stock_movement_history")
      .select("kind, balance_after, transfer_store_name")
      .eq("store_id", f.storeA)
      .eq("category_id", category)
      .order("created_at");
    expect(mine?.map((m) => m.kind)).toEqual(["purchase", "transfer_out"]);
    expect(mine?.map((m) => m.balance_after)).toEqual([3, 2]);
    expect(mine?.[1].transfer_store_name).toBeNull();

    const { data: adminView } = await f.admin
      .from("stock_movement_history")
      .select("transfer_store_name")
      .eq("store_id", f.storeA)
      .eq("category_id", category)
      .eq("kind", "transfer_out")
      .single();
    expect(adminView?.transfer_store_name).toBeTruthy();

    expectDbError(
      (await f.secretary.rpc("create_transfer", { p_from_store_id: f.storeA, p_to_store_id: f.storeB, p_lines: [{ category_id: category, qty: 1 }] }))
        .error,
      "FORBIDDEN",
    );
    expectDbError(
      (await f.secretary.rpc("record_damage", { p_store_id: f.storeA, p_category_id: category, p_qty: 1, p_reason: "x" })).error,
      "FORBIDDEN",
    );
    expectDbError(
      (await f.secretary.rpc("adjust_stock", { p_store_id: f.storeA, p_category_id: category, p_counted_qty: 0, p_reason_id: f.ids.adjustReason }))
        .error,
      "FORBIDDEN",
    );
    const insert = await f.secretary
      .from("stock_movements")
      .insert({ store_id: f.storeA, category_id: category, qty_delta: 5, kind: "adjustment" });
    expect(insert.error).not.toBeNull();
    await expectConsistent(f.storeA, category, 2);
  });
});
