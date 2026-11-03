import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "@/types/database";
import { expectDbError, hasDbEnv, ownFrameOrder, setupFixtures, type Fixtures } from "./fixtures";

/** Phase 5: settings writes are super-admin only; settings rules enforced by Postgres. */
describe.skipIf(!hasDbEnv)("settings", () => {
  let f: Fixtures;

  beforeAll(async () => {
    f = await setupFixtures();
  });

  afterAll(async () => {
    await f?.cleanup();
  });

  it("secretary cannot change settings", async () => {
    const { data: items } = await f.secretary.from("settings_list_items").select("id").eq("list_key", "treatments").limit(2);
    expectDbError((await f.secretary.rpc("reorder_rows", { p_table: "settings_list_items", p_ids: items!.map((i) => i.id) })).error, "FORBIDDEN");
    expectDbError((await f.secretary.rpc("set_loyalty_threshold", { p_orders: 1 })).error, "FORBIDDEN");

    for (const table of ["settings_list_items", "custom_fields", "product_categories"] as const) {
      const update = await f.secretary.from(table).update({ sort: 999 }).neq("id", "00000000-0000-0000-0000-000000000000").select("id");
      expect(update.data ?? [], table).toHaveLength(0);
    }
    const insertStore = await f.secretary.from("stores").insert({ name: "Pirate", prefix: "PIR", kind: "store" });
    expect(insertStore.error?.code).toBe("42501");
    const { data: category } = await f.secretary.from("product_categories").select("id").limit(1).single();
    const threshold = await f.secretary.from("category_thresholds").insert({ store_id: f.storeA, category_id: category!.id, low_stock_min: 1 });
    expect(threshold.error?.code).toBe("42501");
  });

  it("only one lab, and a used prefix is locked", async () => {
    const lab = await f.admin.from("stores").insert({ name: "Deuxième labo", prefix: "LABB", kind: "lab" });
    expect(lab.error?.code).toBe("23505");

    // TSA has orders from the other suites (or gets one now).
    await f.secretary.rpc("create_order", { payload: ownFrameOrder(f, f.storeA) as Json });
    expectDbError((await f.admin.from("stores").update({ prefix: "TSX" }).eq("id", f.storeA)).error, "PREFIX_LOCKED");
    const rename = await f.admin.from("stores").update({ name: "Test Succursale A" }).eq("id", f.storeA);
    expect(rename.error).toBeNull();
  });

  it("drag-sort writes the new order", async () => {
    const { data: before } = await f.admin.from("settings_list_items").select("id").eq("list_key", "vision_types").order("sort");
    const reversed = before!.map((i) => i.id).reverse();
    try {
      expect((await f.admin.rpc("reorder_rows", { p_table: "settings_list_items", p_ids: reversed })).error).toBeNull();
      const { data: after } = await f.admin.from("settings_list_items").select("id").eq("list_key", "vision_types").order("sort");
      expect(after!.map((i) => i.id)).toEqual(reversed);
      expectDbError((await f.admin.rpc("reorder_rows", { p_table: "orders", p_ids: reversed })).error, "INVALID_INPUT");
    } finally {
      await f.admin.rpc("reorder_rows", { p_table: "settings_list_items", p_ids: before!.map((i) => i.id) });
    }
  });

  it("lowering the loyalty threshold makes qualifying clients loyal at once", async () => {
    const { data: setting } = await f.admin.from("app_settings").select("value").eq("key", "loyalty_threshold").single();
    const original = (setting!.value as { orders: number }).orders;

    const first = await f.secretary.rpc("create_order", { payload: ownFrameOrder(f, f.storeA, { subtotal: 0 }) as Json });
    const firstId = (first.data as { order_id: string }).order_id;
    const { data: order } = await f.admin.from("orders").select("client_id").eq("id", firstId).single();
    const clientId = order!.client_id;
    const second = await f.secretary.rpc("create_order", {
      payload: ownFrameOrder(f, f.storeA, { new_client: undefined, client_id: clientId, subtotal: 0 }) as Json,
    });
    for (const id of [firstId, (second.data as { order_id: string }).order_id]) {
      for (const step of ["in_workshop", "prepared", "in_store"] as const) {
        await f.secretary.rpc("change_order_status", { p_order_id: id, p_to_status: step });
      }
      expect((await f.secretary.rpc("deliver_order", { p_order_id: id })).error).toBeNull();
    }
    const isLoyal = async () => (await f.admin.from("clients").select("is_loyal").eq("id", clientId).single()).data!.is_loyal;
    expect(await isLoyal()).toBe(original <= 2);

    try {
      const result = await f.admin.rpc("set_loyalty_threshold", { p_orders: 2 });
      expect(result.error).toBeNull();
      expect(await isLoyal()).toBe(true);
      expect((await f.admin.rpc("set_loyalty_threshold", { p_orders: 2 })).data).toBe(0);
    } finally {
      await f.admin.rpc("set_loyalty_threshold", { p_orders: original });
    }
  });
});
