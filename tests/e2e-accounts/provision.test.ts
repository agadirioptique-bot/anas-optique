import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureStore, ensureUser, hasDbEnv, signIn } from "../db/fixtures";

/**
 * `npm run e2e:accounts` — DEV only. Resets the Playwright users (TSA secretary + super admin, and a
 * second TSA secretary that e2e/session.spec.ts moves between stores) with a
 * fresh random password and writes them to the git-ignored e2e/.auth/accounts.json. Also makes sure
 * TSA has a stocked frame category for the order flow. Nobody types or sees the passwords.
 */
it.skipIf(!hasDbEnv)("provisions the Playwright accounts", async () => {
  const service = createAdminClient();
  const storeA = await ensureStore(service, "TSA", "Test Succursale A");
  const password = randomBytes(24).toString("base64url");
  const secretary = { email: "opticor-e2e-secretary@example.com", fullName: "E2E Secrétaire", role: "secretary" as const };
  const admin = { email: "opticor-e2e-admin@example.com", fullName: "E2E Super Admin", role: "super_admin" as const };
  await ensureUser(service, secretary, storeA, password);
  await ensureUser(service, admin, null, password);
  // Moved between stores by e2e/session.spec.ts: its own account, so parallel specs keep their session.
  const mover = { email: "opticor-e2e-mover@example.com", fullName: "E2E Secrétaire mobile", role: "secretary" as const };
  await ensureUser(service, mover, storeA, password);
  await ensureStore(service, "TSB", "Test Succursale B");

  // A frame category with stock at TSA (topped up each run).
  const adminDb = await signIn(admin.email, password);
  const { data: frames } = await adminDb.from("product_types").select("id").eq("key", "frames").single();
  const frameName = "E2E Monture";
  let { data: category } = await adminDb.from("product_categories").select("id").eq("name", frameName).eq("product_type_id", frames!.id).maybeSingle();
  if (!category) {
    ({ data: category } = await adminDb.from("product_categories").insert({ product_type_id: frames!.id, name: frameName, sale_price: 600 }).select("id").single());
  }
  let { data: supplier } = await adminDb.from("suppliers").select("id").eq("name", "Fournisseur E2E").maybeSingle();
  if (!supplier) ({ data: supplier } = await adminDb.from("suppliers").insert({ name: "Fournisseur E2E" }).select("id").single());
  const purchase = await adminDb.rpc("create_purchase", {
    payload: { supplier_id: supplier!.id, receive_store_id: storeA, lines: [{ kind: "stock", category_id: category!.id, unit_price: 100, qty: 5 }] },
  });
  expect(purchase.error).toBeNull();

  const dir = join(process.cwd(), "e2e/.auth");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "accounts.json");
  writeFileSync(file, JSON.stringify({ secretary: { email: secretary.email, password }, admin: { email: admin.email, password }, mover: { email: mover.email, password }, storePrefix: "TSA", frameName }, null, 2));
  chmodSync(file, 0o600);
});
