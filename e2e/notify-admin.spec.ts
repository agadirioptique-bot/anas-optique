import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import type { Database } from "../src/types/database";

/**
 * Secretary → admin WhatsApp (SPEC §8): the admin saves his number in Settings › Users; after the
 * secretary creates an order, and after "Arrivée en succursale", a prompt offers a wa.me link to
 * him with the message ready. Accounts come from `npm run e2e:accounts` (DEV project).
 */
const file = join(process.cwd(), "e2e/.auth/accounts.json");
type Account = { email: string; password: string };
const accounts = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { secretary: Account; admin: Account; storePrefix: string }) : null;

test.skip(!accounts || !process.env.NEXT_PUBLIC_SUPABASE_URL, "run `npm run e2e:accounts` first");
// A dev server (next dev) can take several seconds per page on a busy machine.
test.describe.configure({ mode: "serial", timeout: 240_000 });
const expect = baseExpect.configure({ timeout: 30_000 });

const ADMIN_NAME = "E2E Super Admin";
const ADMIN_PHONE = "06 61 23 45 67";
const ADMIN_E164 = "212661234567";

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true, caret: "initial", animations: "disabled" });

async function signIn(page: Page, who: "secretary" | "admin") {
  const { email, password } = accounts![who];
  await page.goto("/fr/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("form").getByRole("button").click();
  await expect(page).toHaveURL(who === "admin" ? /\/fr\/dashboard$/ : /\/fr\/orders$/, { timeout: 60_000 });
}

async function db(who: "secretary" | "admin") {
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword(accounts![who]);
  if (error) throw error;
  return client;
}

/** The link to the E2E admin in the open prompt, decoded. */
async function adminLink(page: Page) {
  const dialog = page.getByTestId("notify-admin");
  const link = dialog.getByTestId("notify-admin-link").filter({ hasText: ADMIN_NAME });
  await expect(link).toBeVisible();
  const href = (await link.getAttribute("href"))!;
  expect(href.startsWith(`https://wa.me/${ADMIN_E164}?text=`)).toBe(true);
  return decodeURIComponent(href.split("text=")[1]);
}

let orderId = "";
let number = "";

test.afterAll(async () => {
  const admin = await db("admin");
  const { data: me } = await admin.from("profiles").select("id").eq("email", accounts!.admin.email).single();
  await admin.rpc("set_user_whatsapp", { p_user_id: me!.id, p_phone: null as unknown as string });
  if (orderId) {
    const { data: reason } = await admin.from("settings_list_items").select("id").eq("list_key", "cancel_reasons").eq("code", "other").single();
    await admin.rpc("cancel_order", { p_order_id: orderId, p_reason_id: reason!.id, p_note: "E2E notify-admin", p_refund_amount: 0 });
  }
});

test("the admin saves his WhatsApp number in Settings › Users", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/fr/settings?tab=users");
  const field = page.getByTestId(`user-whatsapp-${accounts!.admin.email}`);
  await field.fill(ADMIN_PHONE);
  await field.press("Enter");
  await expect(page.getByText(`Numéro WhatsApp de ${ADMIN_NAME} enregistré`)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId(`user-whatsapp-${accounts!.admin.email}`)).toHaveValue(ADMIN_PHONE);
});

test("secretary: prompt after a new order, then after « Arrivée en succursale »", async ({ page }) => {
  await signIn(page, "secretary");

  // New order (client's own frame, no stock needed).
  const slip = String(Date.now()).slice(-8);
  await page.goto("/fr/orders/new");
  await page.getByTestId("slip-number").fill(slip);
  await expect(page.getByText("Numéro disponible")).toBeVisible();
  await page.getByRole("radio", { name: "Nouveau client" }).click();
  await page.locator("#new-client-name").fill(`Client Prévenir ${slip}`);
  await page.locator("#new-client-phone").fill(`06${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`);
  await page.getByTestId("wizard-next").click();
  await page.locator("#rx-od-sph").fill("-1");
  await page.locator("#rx-og-sph").fill("-1");
  await page.locator("#rx-og-sph").blur();
  await page.getByTestId("wizard-next").click();
  await page.locator("#own-frame").click();
  await page.getByRole("radiogroup", { name: "Type de verres" }).getByRole("radio").first().click();
  await page.locator("#order-total").fill("1200");
  await page.getByRole("button", { name: "30 %" }).click();
  await page.getByTestId("wizard-next").click();

  // The prompt opens by itself on the success screen.
  await expect(page.getByTestId("order-created")).toBeVisible();
  number = (await page.getByTestId("order-created").textContent())!.match(new RegExp(`${accounts!.storePrefix}-\\d+`))![0];
  const confirmed = await adminLink(page);
  expect(confirmed).toContain(`nouvelle commande ${number} confirmée`);
  expect(confirmed).toContain("acompte");
  await shot(page, "notify-admin-confirmed");
  await page.getByTestId("notify-admin-later").click();
  await expect(page.getByTestId("notify-admin")).toBeHidden();
  // The button stays on the success screen.
  await page.getByTestId("notify-admin-open").click();
  await expect(page.getByTestId("notify-admin")).toBeVisible();
  await page.getByTestId("notify-admin-later").click();

  // Up to "Préparée" through the secretary's own RPCs, then « Arrivée en succursale » in the app.
  const secretary = await db("secretary");
  const { data: row } = await secretary.from("order_overview").select("id").eq("display_number", number).single();
  orderId = row!.id!;
  for (const to of ["in_workshop", "prepared"] as const) {
    const { error } = await secretary.rpc("change_order_status", { p_order_id: orderId, p_to_status: to });
    expect(error).toBeNull();
  }
  await page.goto(`/fr/orders/${orderId}`);
  await page.getByTestId("next-step").filter({ hasText: "Arrivée en succursale" }).click();
  await expect(page.getByTestId("order-status")).toContainText("En succursale");
  const arrived = await adminLink(page);
  expect(arrived).toContain(`la commande ${number}`);
  expect(arrived).toContain("est arrivée");
  expect(arrived).toContain("Reste à payer");
  await shot(page, "notify-admin-in-store");
  await page.getByTestId("notify-admin-later").click();

  // The order page keeps a « Prévenir l'admin » button while the order is in store.
  await expect(page.getByTestId("notify-admin-open")).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByTestId("notify-admin-open").click();
  await expect(page.getByTestId("notify-admin").getByTestId("notify-admin-link").filter({ hasText: ADMIN_NAME })).toBeVisible();
  await page.screenshot({ path: "test-results/screens/notify-admin-phone.png", caret: "initial", animations: "disabled" });
});
