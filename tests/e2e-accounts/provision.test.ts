import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureStore, ensureUser, hasDbEnv, openTestStore, signIn } from "../db/fixtures";

/**
 * `npm run e2e:accounts` — DEV only. Resets the Playwright users (TSA secretary + super admin, and a
 * second TSA secretary that e2e/session.spec.ts moves between stores) with a
 * fresh random password and writes them to the git-ignored e2e/.auth/accounts.json. Also makes sure
 * TSA has a stocked frame category for the order flow, and creates a pending recurring charge for
 * the charges flow, and cancels the open orders earlier runs left in the test stores (TSA/TSB only)
 * so the board doesn't fill up. Nobody types or sees the passwords. TSA/TSB are left active (with their
 * charge location open) for the Playwright run, even if someone switched them off on dev.
 */
it.skipIf(!hasDbEnv)("provisions the Playwright accounts", async () => {
  const service = createAdminClient();
  const storeA = await ensureStore(service, "TSA", "Test Succursale A");
  await openTestStore(service, storeA);
  const password = randomBytes(24).toString("base64url");
  const secretary = { email: "opticor-e2e-secretary@example.com", fullName: "E2E Secrétaire", role: "secretary" as const };
  const admin = { email: "opticor-e2e-admin@example.com", fullName: "E2E Super Admin", role: "super_admin" as const };
  await ensureUser(service, secretary, storeA, password);
  await ensureUser(service, admin, null, password);
  // Moved between stores by e2e/session.spec.ts: its own account, so parallel specs keep their session.
  const mover = { email: "opticor-e2e-mover@example.com", fullName: "E2E Secrétaire mobile", role: "secretary" as const };
  await ensureUser(service, mover, storeA, password);
  const storeB = await ensureStore(service, "TSB", "Test Succursale B");
  await openTestStore(service, storeB);

  // A frame category with stock at TSA (topped up each run).
  const adminDb = await signIn(admin.email, password);
  const { data: frames } = await adminDb.from("product_types").select("id").eq("key", "frames").single();
  const frameName = "E2E Monture";
  let { data: category } = await adminDb.from("product_categories").select("id").eq("name", frameName).eq("product_type_id", frames!.id).maybeSingle();
  if (!category) {
    ({ data: category } = await adminDb.from("product_categories").insert({ product_type_id: frames!.id, name: frameName, sale_price: 600 }).select("id").single());
  }
  // The order flow picks this frame: make sure nobody left it archived.
  await adminDb.from("product_categories").update({ is_archived: false }).eq("id", category!.id);
  let { data: supplier } = await adminDb.from("suppliers").select("id").eq("name", "Fournisseur E2E").maybeSingle();
  if (!supplier) ({ data: supplier } = await adminDb.from("suppliers").insert({ name: "Fournisseur E2E" }).select("id").single());
  const purchase = await adminDb.rpc("create_purchase", {
    payload: { supplier_id: supplier!.id, receive_store_id: storeA, lines: [{ kind: "stock", category_id: category!.id, unit_price: 100, qty: 5 }] },
  });
  expect(purchase.error).toBeNull();

  // A pending recurring charge for e2e/charges.spec.ts to approve (a new one each run; older ones deactivated).
  const { data: rent } = await adminDb.from("settings_list_items").select("id").eq("list_key", "charge_categories").eq("code", "rent").single();
  const { data: general } = await adminDb.from("charge_locations").select("id").eq("is_general", true).single();
  await adminDb.from("recurring_charges").update({ is_active: false }).like("label", "E2E récurrente %");
  const pendingCharge = `E2E récurrente ${Date.now().toString(36)}`;
  const recurring = await adminDb
    .from("recurring_charges")
    .insert({ label: pendingCharge, amount: 1500, category_id: rent!.id, location_id: general!.id, day_of_month: 1 });
  expect(recurring.error).toBeNull();
  const { data: today } = await service.rpc("business_date", { ts: new Date().toISOString() });
  expect((await service.rpc("generate_recurring_charges", { p_date: today! })).error).toBeNull();

  // Earlier runs' open orders in the test stores (older than an hour, so a run in progress is spared).
  const { data: reason } = await adminDb.from("settings_list_items").select("id").eq("list_key", "cancel_reasons").eq("is_archived", false).order("sort").limit(1).single();
  const { data: stale } = await adminDb
    .from("orders")
    .select("id")
    .in("store_id", [storeA, storeB])
    .in("status", ["confirmed", "in_workshop", "prepared", "in_store"])
    .lt("created_at", new Date(Date.now() - 3_600_000).toISOString());
  for (const o of stale ?? []) {
    const { error } = await adminDb.rpc("cancel_order", { p_order_id: o.id, p_reason_id: reason!.id, p_note: "Nettoyage E2E", p_refund_amount: 0 });
    expect(error).toBeNull();
  }

  const dir = join(process.cwd(), "e2e/.auth");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "accounts.json");
  writeFileSync(file, JSON.stringify({ secretary: { email: secretary.email, password }, admin: { email: admin.email, password }, mover: { email: mover.email, password }, pendingCharge, storePrefix: "TSA", frameName }, null, 2));
  chmodSync(file, 0o600);
});
