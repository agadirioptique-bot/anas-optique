import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectDbError, hasDbEnv, setupFixtures, type Fixtures } from "./fixtures";

/** Charges page (phase 9): write rules, soft delete, audit, recurring + approval, totals, scope. */
describe.skipIf(!hasDbEnv)("charges", () => {
  let f: Fixtures;
  let location: string;
  let supplierCategory: string;
  const recurring: string[] = [];
  const runId = Date.now().toString(36);
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    f = await setupFixtures();
    // A location of our own so totals and lists only see this run's charges.
    const { data, error } = await f.admin.from("charge_locations").insert({ label_fr: `Test charges ${runId}`, label_en: `Test charges ${runId}` }).select("id").single();
    if (error) throw error;
    location = data.id;
    const { data: cat } = await f.admin.from("settings_list_items").select("id").eq("list_key", "charge_categories").eq("code", "supplier_purchase").single();
    supplierCategory = cat!.id;
  });

  afterAll(async () => {
    if (recurring.length) await f?.admin.from("recurring_charges").update({ is_active: false }).in("id", recurring);
    if (location) await f?.admin.from("charge_locations").update({ is_archived: true }).eq("id", location);
    await f?.cleanup();
  });

  async function newCharge(amount: number, extra: Record<string, unknown> = {}) {
    const { data, error } = await f.admin
      .from("charges")
      .insert({ amount, category_id: f.ids.rentCategory, location_id: location, reason: `Test ${runId}`, ...extra })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  async function newRecurring(day: number, amount = 100) {
    const { data, error } = await f.admin
      .from("recurring_charges")
      .insert({ label: `Loyer test ${runId} ${day}`, amount, category_id: f.ids.rentCategory, location_id: location, day_of_month: day })
      .select("id")
      .single();
    if (error) throw error;
    recurring.push(data.id);
    return data.id;
  }

  it("a manual charge is approved by its author; edits are audited with the actor", async () => {
    const id = await newCharge(250);
    const { data: row } = await f.admin.from("charges").select("status, approved_by, approved_at, created_by").eq("id", id).single();
    expect(row).toMatchObject({ status: "approved", approved_by: f.adminId, created_by: f.adminId });
    expect(row!.approved_at).toBeTruthy();

    expect((await f.admin.from("charges").update({ amount: 275, reason: "Loyer corrigé" }).eq("id", id)).error).toBeNull();
    const { data: audit } = await f.admin.from("audit_log").select("action, old, new, actor").eq("table_name", "charges").eq("row_id", id).order("at");
    expect(audit?.map((a) => a.action)).toEqual(["insert", "update"]);
    const update = audit![1] as unknown as { old: { amount: number }; new: { amount: number; updated_at: string }; actor: string };
    expect(update.actor).toBe(f.adminId);
    expect([update.old.amount, update.new.amount]).toEqual([250, 275]);
  });

  it("soft delete records who and when; restore clears it; a hard delete changes nothing", async () => {
    const id = await newCharge(80);
    await f.admin.from("charges").update({ is_deleted: true }).eq("id", id);
    let { data: row } = await f.admin.from("charges").select("is_deleted, deleted_by, deleted_at").eq("id", id).single();
    expect(row).toMatchObject({ is_deleted: true, deleted_by: f.adminId });
    expect(row!.deleted_at).toBeTruthy();

    await f.admin.from("charges").update({ is_deleted: false }).eq("id", id);
    ({ data: row } = await f.admin.from("charges").select("is_deleted, deleted_by, deleted_at").eq("id", id).single());
    expect(row).toEqual({ is_deleted: false, deleted_by: null, deleted_at: null });

    await f.admin.from("charges").delete().eq("id", id);
    const { count } = await f.admin.from("charges").select("id", { count: "exact", head: true }).eq("id", id);
    expect(count).toBe(1);
  });

  it("status, approval and source columns can't be written directly", async () => {
    const id = await newCharge(60);
    for (const patch of [{ status: "pending" as const }, { approved_by: f.secretaryId }, { supplier_payment_id: crypto.randomUUID() }, { deleted_by: f.adminId }]) {
      const { error } = await f.admin.from("charges").update(patch).eq("id", id);
      expect(error?.code, JSON.stringify(patch)).toBe("42501");
    }
    const insert = await f.admin
      .from("charges")
      .insert({ amount: 1, category_id: f.ids.rentCategory, location_id: location, reason: "x", status: "pending" });
    expect(insert.error?.code).toBe("42501");
  });

  it("category must be an active charge category (never the supplier one) and the location active", async () => {
    expectDbError((await f.admin.from("charges").insert({ amount: 10, category_id: f.ids.cash, location_id: location, reason: "x" })).error, "INVALID_INPUT");
    expectDbError((await f.admin.from("charges").insert({ amount: 10, category_id: supplierCategory, location_id: location, reason: "x" })).error, "INVALID_INPUT");

    const { data: archived } = await f.admin.from("charge_locations").insert({ label_fr: `Archivée ${runId}`, label_en: `Archived ${runId}`, is_archived: true }).select("id").single();
    expectDbError((await f.admin.from("charges").insert({ amount: 10, category_id: f.ids.rentCategory, location_id: archived!.id, reason: "x" })).error, "INVALID_INPUT");
    const id = await newCharge(10);
    expectDbError((await f.admin.from("charges").update({ location_id: archived!.id }).eq("id", id)).error, "INVALID_INPUT");
    expectDbError(
      (await f.admin.from("recurring_charges").insert({ label: "x", amount: 1, category_id: supplierCategory, location_id: location, day_of_month: 1 })).error,
      "INVALID_INPUT",
    );
  });

  it("recurring: one pending charge per month, approved with an edited amount, once", async () => {
    const due = await newRecurring(1, 4000);
    const notYet = await newRecurring(28);
    const firstOfMonth = `${today.slice(0, 7)}-01`;

    expect((await f.service.rpc("generate_recurring_charges", { p_date: firstOfMonth })).error).toBeNull();
    expect((await f.service.rpc("generate_recurring_charges", { p_date: firstOfMonth })).error).toBeNull();
    const { data: rows } = await f.admin.from("charges").select("id, status, amount, charge_date, approved_by").in("recurring_charge_id", [due, notYet]);
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({ status: "pending", amount: 4000, charge_date: firstOfMonth, approved_by: null });

    const pending = rows![0].id;
    expect((await f.admin.rpc("approve_charge", { p_charge_id: pending, p_amount: 4100 })).error).toBeNull();
    const { data: approved } = await f.admin.from("charges").select("status, amount, approved_by").eq("id", pending).single();
    expect(approved).toEqual({ status: "approved", amount: 4100, approved_by: f.adminId });
    expectDbError((await f.admin.rpc("approve_charge", { p_charge_id: pending })).error, "NOT_FOUND");

    // A skipped (deleted) pending charge can't be approved.
    const skipped = await newRecurring(1, 50);
    await f.service.rpc("generate_recurring_charges", { p_date: firstOfMonth });
    const { data: next } = await f.admin.from("charges").select("id").eq("recurring_charge_id", skipped).single();
    await f.admin.from("charges").update({ is_deleted: true }).eq("id", next!.id);
    expectDbError((await f.admin.rpc("approve_charge", { p_charge_id: next!.id })).error, "NOT_FOUND");
  });

  it("totals equal the ledger rows of the filter, deleted ones excluded", async () => {
    await newCharge(100.1);
    await newCharge(200.2);
    const gone = await newCharge(999);
    await f.admin.from("charges").update({ is_deleted: true }).eq("id", gone);

    const { data: rows } = await f.admin.from("charge_overview").select("amount, status").eq("location_id", location).eq("is_deleted", false);
    const cents = (status: string) => rows!.filter((r) => r.status === status).reduce((s, r) => s + Math.round((r.amount ?? 0) * 100), 0);
    const { data: totals } = await f.admin.rpc("charge_totals", { p_from: "2000-01-01", p_to: "2100-01-01", p_location_id: location }).single();
    expect(Math.round(totals!.approved_total * 100)).toBe(cents("approved"));
    expect(Math.round(totals!.pending_total * 100)).toBe(cents("pending"));
    expect(totals!.approved_count + totals!.pending_count).toBe(rows!.length);
  });

  it("the ledger shows the source and the purchase of a supplier-payment charge", async () => {
    const { data: purchase } = await f.admin.rpc("create_purchase", {
      payload: { supplier_id: f.ids.supplier, receive_store_id: f.storeA, lines: [{ kind: "lens", description: "Verres", amount: 90 }], payment: { amount: 90, method_id: f.ids.cash } },
    });
    const { data: row } = await f.admin.from("charge_overview").select("source, purchase_id, category_code, status").eq("purchase_id", purchase as string).single();
    expect(row).toEqual({ source: "supplier", purchase_id: purchase, category_code: "supplier_purchase", status: "approved" });
  });

  it("secretary: nothing to see, nothing to write", async () => {
    expect((await f.secretary.from("charge_overview").select("id").limit(1)).data).toEqual([]);
    expect((await f.secretary.from("recurring_charges").select("id").limit(1)).data).toEqual([]);
    const { data: totals } = await f.secretary.rpc("charge_totals", { p_from: "2000-01-01", p_to: "2100-01-01" }).single();
    expect(totals).toEqual({ approved_total: 0, pending_total: 0, approved_count: 0, pending_count: 0 });
    expect((await f.secretary.from("charges").insert({ amount: 1, category_id: f.ids.rentCategory, location_id: location, reason: "x" })).error).not.toBeNull();
    expectDbError((await f.secretary.rpc("approve_charge", { p_charge_id: crypto.randomUUID() })).error, "FORBIDDEN");
  });
});
