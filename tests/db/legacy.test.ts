import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "@/types/database";
import { expectDbError, hasDbEnv, setupFixtures, type Fixtures } from "./fixtures";

/**
 * SPEC §12 (Excel history) and §5.3 (phones): import through the service role (the SQL editor in real
 * life), read by every role, never changed; a phone shared by a family, but not twice under one name.
 * Test history store: TSH ("Test Historique"), put away again by finish_legacy_import.
 */
describe.skipIf(!hasDbEnv)("history import and shared phones", () => {
  let f: Fixtures;
  let orderId: string;
  const run = randomUUID().slice(0, 8);
  const key = (k: string) => `T-${run}-${k}`;

  beforeAll(async () => {
    f = await setupFixtures();
    const payload = {
      store: { name: "Test Historique", prefix: "TSH" },
      clients: [
        { key: key("c1"), full_name: "Historique Test", phone: f.newPhone(), has_whatsapp: true, notes: "test" },
        { key: key("c2"), full_name: "Sans Numero Test", phone: null, notes: "test" },
      ],
      orders: [
        {
          key: key("o1"),
          client_key: key("c1"),
          booklet: "",
          slip: f.nextSlip(),
          created_at: "2022-03-01T12:00:00+01:00",
          re_sph: -1.25, re_cyl: -0.5, re_axis: 90, re_add: null,
          le_sph: -1, le_cyl: null, le_axis: null, le_add: null,
          lens_type_code: "single_vision",
          treatment_codes: ["anti_reflective"],
          lens_details: "",
          total: 500, deposit: 200, balance: 300,
          legacy: { row: 1, carnet: "A", date_exact: true, reste_origine: 300, raw: { od: "-1.25(-0.5 a 90)" }, anomalies: [] },
        },
      ],
    };
    const first = await f.service.rpc("import_legacy_batch", { p: payload as Json });
    if (first.error) throw first.error;
    expect(first.data).toMatchObject({ clients_created: 2, orders_created: 1, orders_skipped: 0 });
    // Running the same batch again changes nothing.
    const again = await f.service.rpc("import_legacy_batch", { p: payload as Json });
    expect(again.data).toMatchObject({ clients_created: 0, clients_matched: 2, orders_created: 0, orders_skipped: 1 });
    const { data } = await f.service.from("orders").select("id").eq("legacy->>key", key("o1")).single();
    orderId = data!.id;
  });

  afterAll(async () => {
    await f?.service.rpc("finish_legacy_import", { p_prefix: "TSH" });
    await f?.cleanup();
  });

  it("imports a delivered, fully paid order with its prescription, treatment and history", async () => {
    const { data: o } = await f.admin.from("order_overview").select("status, total, paid, balance, display_number, re_cyl, re_axis").eq("id", orderId).single();
    expect(o).toMatchObject({ status: "delivered", total: 500, paid: 500, balance: 0, re_cyl: -0.5, re_axis: 90 });
    expect(o!.display_number).toMatch(/^TSH-\d+$/);
    const { count } = await f.admin.from("stock_movements").select("id", { count: "exact", head: true }).eq("ref_id", orderId);
    expect(count).toBe(0);
  });

  it("secretaries of any store read the history (prescription, payments, store name)", async () => {
    const { data: o } = await f.secretary.from("order_overview").select("id, display_number, store_prefix").eq("id", orderId).maybeSingle();
    expect(o?.store_prefix).toBe("TSH");
    const { data: pays } = await f.secretary.from("payments").select("amount").eq("order_id", orderId);
    expect(pays?.map((p) => p.amount).sort()).toEqual([200, 300]);
  });

  it("a history order never changes", async () => {
    expectDbError(
      (await f.admin.rpc("cancel_order", { p_order_id: orderId, p_reason_id: f.ids.cancelReason, p_note: "test", p_refund_amount: 0 })).error,
      "LEGACY_READ_ONLY",
    );
    expectDbError((await f.service.from("orders").update({ lens_details: "x" }).eq("id", orderId)).error, "LEGACY_READ_ONLY");
    expectDbError(
      (await f.service.from("payments").insert({ order_id: orderId, amount: 10, method_id: f.ids.cash, kind: "balance" })).error,
      "LEGACY_READ_ONLY",
    );
  });

  it("one phone for a family, but not twice under the same name; the app always needs a phone", async () => {
    const phone = f.newPhone();
    const add = (full_name: string, phone_e164: string | null) => f.secretary.from("clients").insert({ full_name, phone_e164, has_whatsapp: true });
    expect((await add("Maman Famille", phone)).error).toBeNull();
    expect((await add("Fils Famille", phone)).error).toBeNull();
    expect((await add("  maman   FAMILLE ", phone)).error?.code).toBe("23505");
    expectDbError((await add("Sans Numero App", null)).error, "PHONE_REQUIRED");
  });

  it("an imported client without a phone stays editable without one", async () => {
    const { data: c } = await f.secretary.from("clients").select("id, phone_e164").eq("legacy_key", key("c2")).single();
    expect(c!.phone_e164).toBeNull();
    expect((await f.secretary.from("clients").update({ notes: "appelé" }).eq("id", c!.id)).error).toBeNull();
  });
});
