import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import type { Database } from "../src/types/database";

/**
 * Charges against the DEV project (SPEC §8, phase 9): the super admin adds a charge linked to an
 * order, edits it (history shows old → new), deletes and restores it; approves the pending
 * recurring charge made by `npm run e2e:accounts` with another amount (sidebar badge goes down);
 * manages a recurring charge. Secretaries are locked out. Screenshots go to test-results/screens/.
 */
const file = join(process.cwd(), "e2e/.auth/accounts.json");
const accounts = existsSync(file)
  ? (JSON.parse(readFileSync(file, "utf8")) as {
      secretary: { email: string; password: string };
      admin: { email: string; password: string };
      pendingCharge?: string;
    })
  : null;

test.skip(!accounts?.pendingCharge || !process.env.NEXT_PUBLIC_SUPABASE_URL, "run `npm run e2e:accounts` first");
// A dev server (next dev) can take several seconds per page or action on a busy machine.
test.describe.configure({ mode: "serial", timeout: 180_000 });
const expect = baseExpect.configure({ timeout: 30_000 });

const runId = Date.now().toString(36);

// caret / animations: screenshots must not edit the DOM before hydration or catch a dialog mid-animation.
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true, caret: "initial", animations: "disabled" });

function watchHydration(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /hydrat/i.test(msg.text())) errors.push(msg.text().slice(0, 300));
  });
  return errors;
}

async function signIn(page: Page, who: "secretary" | "admin") {
  const { email, password } = accounts![who];
  await page.goto("/fr/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("form").getByRole("button").click();
  await expect(page).toHaveURL(who === "admin" ? /\/fr\/dashboard$/ : /\/fr\/orders$/, { timeout: 60_000 });
}

async function adminDb() {
  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await db.auth.signInWithPassword(accounts!.admin);
  if (error) throw error;
  return db;
}

async function pick(page: Page, combobox: string, option: string) {
  await page.getByRole("dialog").getByRole("combobox", { name: combobox }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

const rowMenu = (page: Page, reason: string) => page.getByRole("button", { name: `Actions pour ${reason}` });

test("super admin: add a charge linked to an order, edit, history, delete and restore", async ({ page }) => {
  const hydration = watchHydration(page);
  const db = await adminDb();
  const { data: order } = await db.from("order_numbers").select("order_id, display_number").limit(1).single();
  const reason = `E2E charge ${runId}`;

  await signIn(page, "admin");
  await page.goto("/fr/charges");
  await page.getByRole("button", { name: "Nouvelle charge" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Montant").fill("345");
  await pick(page, "Catégorie", "Électricité");
  await dialog.getByLabel("Motif").fill(reason);
  await dialog.getByPlaceholder("N° de commande, ex. 832").fill(order!.display_number!);
  await dialog.getByRole("option", { name: new RegExp(order!.display_number!) }).first().click();
  await expect(dialog.getByText(order!.display_number!)).toBeVisible();
  await shot(page, "charges-new");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Charge ajoutée")).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: reason });
  await expect(row).toBeVisible();
  await expect(row.getByRole("link", { name: order!.display_number! })).toBeVisible();
  await expect(row.getByText("Manuelle")).toBeVisible();
  await shot(page, "charges-ledger");

  await rowMenu(page, reason).click();
  await page.getByRole("menuitem", { name: "Modifier" }).click();
  await page.getByRole("dialog").getByLabel("Montant").fill("400");
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Charge enregistrée")).toBeVisible();

  await rowMenu(page, reason).click();
  await page.getByRole("menuitem", { name: "Historique" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Modifiée")).toBeVisible();
  await expect(drawer.getByText("Créée")).toBeVisible();
  await expect(drawer.getByText(/345/).first()).toBeVisible();
  await expect(drawer.getByText(/400/).first()).toBeVisible();
  await shot(page, "charges-history");
  await page.keyboard.press("Escape");

  await rowMenu(page, reason).click();
  await page.getByRole("menuitem", { name: "Supprimer" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();
  await expect(page.getByText("Charge supprimée")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: reason })).toHaveCount(0);

  await page.getByRole("button", { name: "Afficher les supprimées" }).click();
  await expect(page.getByRole("row").filter({ hasText: reason }).getByText("Supprimée")).toBeVisible();
  await rowMenu(page, reason).click();
  await page.getByRole("menuitem", { name: "Restaurer" }).click();
  await expect(page.getByText("Charge restaurée")).toBeVisible();

  const { data: saved } = await db.from("charges").select("id, amount, order_id, is_deleted").eq("reason", reason).single();
  expect(saved).toMatchObject({ amount: 400, order_id: order!.order_id, is_deleted: false });
  expect(hydration).toEqual([]);
  // Leave dev tidy: this test charge doesn't belong in the month's totals.
  await db.from("charges").update({ is_deleted: true }).eq("id", saved!.id);
});

test("super admin: approve the pending recurring charge with another amount; the badge goes down", async ({ page }) => {
  const db = await adminDb();
  const label = accounts!.pendingCharge!;
  const pendingCount = async () =>
    (await db.from("charges").select("id", { count: "exact", head: true }).eq("status", "pending").eq("is_deleted", false)).count ?? 0;
  const before = await pendingCount();
  expect(before).toBeGreaterThan(0);

  await signIn(page, "admin");
  await page.goto("/fr/charges");
  const nav = page.getByRole("complementary").getByRole("link", { name: /Charges/ });
  await expect(nav).toContainText(String(before));
  const item = page.getByRole("listitem").filter({ hasText: label });
  await expect(item).toBeVisible();
  await shot(page, "charges-pending");

  await item.getByRole("button", { name: "Autre montant" }).click();
  await page.getByRole("dialog").getByLabel("Montant").fill("1600");
  await page.getByRole("dialog").getByRole("button", { name: "Approuver" }).click();
  await expect(page.getByText(`${label} approuvée`)).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: label })).toHaveCount(0);

  const { data: approved } = await db.from("charges").select("status, amount").eq("reason", label).single();
  expect(approved).toEqual({ status: "approved", amount: 1600 });
  expect(await pendingCount()).toBe(before - 1);
  if (before - 1 > 0) await expect(nav).toContainText(String(before - 1));
  else await expect(nav).not.toContainText(/\d/);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/fr/charges");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shot(page, "charges-mobile");
});

test("super admin: recurring charge — create, deactivate, delete while unused", async ({ page }) => {
  const label = `E2E loyer ${runId}`;
  await signIn(page, "admin");
  await page.goto("/fr/charges?tab=recurring");
  await page.getByRole("button", { name: "Nouvelle charge récurrente" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Libellé").fill(label);
  await dialog.getByLabel("Montant").fill("4000");
  await pick(page, "Catégorie", "Loyer");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Charge récurrente ajoutée")).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: label });
  await expect(row).toBeVisible();
  await row.getByRole("switch", { name: `Activer ou désactiver ${label}` }).click();
  await expect(page.getByText("Charge récurrente désactivée")).toBeVisible();
  await shot(page, "charges-recurring");

  await page.getByRole("button", { name: `Actions pour ${label}` }).click();
  await page.getByRole("menuitem", { name: "Supprimer" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();
  await expect(page.getByText("Charge récurrente supprimée")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: label })).toHaveCount(0);
});

test("secretary: Access denied on charges", async ({ page }) => {
  await signIn(page, "secretary");
  await page.goto("/fr/charges");
  await expect(page.getByText("Accès non autorisé")).toBeVisible();
});
