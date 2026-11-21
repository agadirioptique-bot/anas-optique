import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import type { Database } from "../src/types/database";

/**
 * Notifications against the DEV project (SPEC §10, phase 12): while the super admin has the app
 * open, the E2E secretary makes a blocked duplicate-slip attempt; the bell count goes up WITHOUT a
 * reload (Realtime) with a toast; clicking the item marks it read and opens the order;
 * /notifications marks everything read. Accounts come from `npm run e2e:accounts`.
 */
const file = join(process.cwd(), "e2e/.auth/accounts.json");
const accounts = existsSync(file)
  ? (JSON.parse(readFileSync(file, "utf8")) as { secretary: { email: string; password: string }; admin: { email: string; password: string }; storePrefix: string })
  : null;

test.skip(!accounts || !process.env.NEXT_PUBLIC_SUPABASE_URL, "run `npm run e2e:accounts` first");
// A dev server (next dev) can take several seconds per page on a busy machine.
test.describe.configure({ mode: "serial", timeout: 180_000 });
const expect = baseExpect.configure({ timeout: 30_000 });

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true, caret: "initial", animations: "disabled" });

async function signIn(page: Page, who: "secretary" | "admin") {
  const { email, password } = accounts![who];
  await page.goto("/fr/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(who === "admin" ? /\/fr\/dashboard$/ : /\/fr\/orders$/, { timeout: 60_000 });
}

/** The secretary tries to save the same slip twice (her own session, like the app does). */
async function duplicateSlipAttempt(): Promise<{ orderId: string; number: string }> {
  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await db.auth.signInWithPassword(accounts!.secretary);
  if (error) throw error;
  const { data: store } = await db.from("stores").select("id").eq("prefix", accounts!.storePrefix).single();
  const { data: lens } = await db.from("settings_list_items").select("id").eq("list_key", "lens_types").eq("code", "single_vision").single();
  const { data: required } = await db.from("custom_fields").select("key, field_type, is_builtin").eq("visibility", "required");
  const fields: Record<string, unknown> = {};
  for (const f of required ?? []) if (f.is_builtin && f.key !== "prescription_photo" && f.key !== "vision_type") fields[f.key] = f.field_type === "number" ? 32 : "Test";
  const payload = {
    store_id: store!.id,
    slip_number: Number(String(Date.now()).slice(-8)),
    new_client: { full_name: "Doublon E2E", phone_e164: `+2126${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, has_whatsapp: false },
    client_own_frame: true,
    lens_type_id: lens!.id,
    subtotal: 400,
    ...fields,
  };
  const first = await db.rpc("create_order", { payload });
  if (first.error) throw first.error;
  const created = first.data as { order_id: string; display_number: string };
  const again = await db.rpc("create_order", { payload });
  expect((again.data as { error?: string }).error).toBe("DUPLICATE_SLIP");
  return { orderId: created.order_id, number: created.display_number };
}

const unreadCount = async (page: Page) => {
  const badge = page.getByTestId("notification-count");
  return (await badge.count()) ? Number((await badge.textContent())?.replace(/\D/g, "") || 0) : 0;
};

test("Realtime bell, toast, open marks read, mark all read", async ({ page }) => {
  await signIn(page, "admin");
  await expect(page.getByTestId("notification-bell")).toBeVisible();
  await page.waitForTimeout(2000); // let the Realtime channel subscribe
  const before = await unreadCount(page);

  const { orderId, number } = await duplicateSlipAttempt();

  // No reload: the count and a toast arrive through Realtime.
  await expect(page.getByTestId("notification-bell")).toHaveAccessibleName(new RegExp(`${before + 1} non lue`));
  await expect(page.getByText("Doublon de bon bloqué").first()).toBeVisible();

  await page.getByTestId("notification-bell").click();
  const item = page.getByTestId("notification-item").filter({ hasText: number }).first();
  await expect(item).toBeVisible();
  await expect(item).toHaveAttribute("data-kind", "duplicate_slip_blocked");
  await shot(page, "notifications-dropdown");
  await item.click();
  await expect(page).toHaveURL(new RegExp(`/fr/orders/${orderId}$`));
  await expect(page.getByTestId("notification-bell")).toHaveAccessibleName(before === 0 ? /^Notifications$/ : new RegExp(`${before} non lue`));

  await page.goto("/fr/notifications?filter=unread");
  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
  await shot(page, "notifications-page");
  if (before > 0) {
    await page.getByRole("button", { name: "Tout marquer comme lu" }).click();
    await expect(page.getByText("Aucune notification non lue.")).toBeVisible();
  }
  await expect(page.getByTestId("notification-count")).toHaveCount(0);

  await page.goto("/fr/notifications");
  await expect(page.getByTestId("notifications-list").getByText(number).first()).toBeVisible();
});

test("secretary: bell and page work, no duplicate-slip alerts for her", async ({ page }) => {
  await signIn(page, "secretary");
  await expect(page.getByTestId("notification-bell")).toBeVisible();
  await page.goto("/fr/notifications");
  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
  await expect(page.locator('[data-kind="duplicate_slip_blocked"]')).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/fr/notifications");
  await shot(page, "notifications-mobile");
});
