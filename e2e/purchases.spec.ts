import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import type { Database } from "../src/types/database";

/**
 * Purchasing against the DEV project (SPEC §8, phase 8): the super admin creates a supplier, records
 * a purchase (stock line + lens line, 30 % paid now), settles the rest from the detail page; stock
 * goes up at the receive location and each payment created one charge. Secretaries are locked out.
 * Accounts come from `npm run e2e:accounts`. Screenshots go to test-results/screens/.
 */
const file = join(process.cwd(), "e2e/.auth/accounts.json");
const accounts = existsSync(file)
  ? (JSON.parse(readFileSync(file, "utf8")) as {
      secretary: { email: string; password: string };
      admin: { email: string; password: string };
    })
  : null;

test.skip(!accounts || !process.env.NEXT_PUBLIC_SUPABASE_URL, "run `npm run e2e:accounts` first");
// A dev server (next dev) can take several seconds per page or action on a busy machine.
test.describe.configure({ mode: "serial", timeout: 180_000 });
const expect = baseExpect.configure({ timeout: 30_000 });

const STORE = "Test Succursale A";
const CATEGORY = "Catégorie A";

// caret: "initial" — hiding the caret edits the DOM, which React reports as a hydration mismatch
// when the screenshot is taken before a slow dev server has hydrated the page.
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true, caret: "initial", animations: "disabled" });

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

async function stockAt(db: Awaited<ReturnType<typeof adminDb>>, storeId: string, categoryId: string) {
  const { data } = await db.from("stock_levels").select("quantity").eq("store_id", storeId).eq("category_id", categoryId).maybeSingle();
  return data?.quantity ?? 0;
}

async function pick(page: Page, combobox: string, option: string) {
  await page.getByRole("dialog").getByRole("combobox", { name: combobox }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("super admin: supplier, purchase with a 30 % payment, settle the rest", async ({ page }) => {
  const hydration = watchHydration(page);
  const db = await adminDb();
  const { data: store } = await db.from("stores").select("id").eq("name", STORE).single();
  const { data: category } = await db.from("product_categories").select("id").eq("name", CATEGORY).eq("is_archived", false).limit(1).single();
  const before = await stockAt(db, store!.id, category!.id);
  const supplier = `Fournisseur E2E ${Date.now().toString(36)}`;

  await signIn(page, "admin");
  await page.goto("/fr/purchases?tab=suppliers");
  await page.getByRole("button", { name: "Nouveau fournisseur" }).click();
  await page.getByRole("dialog").getByLabel("Nom").fill(supplier);
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Fournisseur ajouté")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: supplier })).toBeVisible();
  await shot(page, "purchases-suppliers");

  await page.getByRole("tab", { name: "Achats" }).click();
  await page.getByRole("button", { name: "Nouvel achat" }).click();
  const form = page.getByRole("dialog");
  await expect(form.getByText("marchandise reçue")).toBeVisible();
  await pick(page, "Fournisseur", supplier);
  await pick(page, "Reçu à", STORE);
  await pick(page, "Catégorie", CATEGORY);
  await form.getByLabel("Prix unitaire").fill("120");
  await form.getByRole("button", { name: "Ajouter 1" }).click();
  await form.getByRole("button", { name: "Ajouter des verres" }).click();
  await form.getByLabel("Description").fill("Verres progressifs E2E");
  await form.getByLabel("Montant", { exact: true }).fill("300");
  await expect(form.getByText(/540/).first()).toBeVisible();
  await form.getByRole("radio", { name: "30 %" }).click();
  await expect(form.getByText(/162/).first()).toBeVisible();
  await shot(page, "purchases-new");
  await form.getByRole("button", { name: /^Enregistrer l'achat/ }).click();

  await expect(page).toHaveURL(/\/fr\/purchases\/[0-9a-f-]{36}$/);
  const purchaseId = page.url().split("/").pop()!;
  await expect(page.getByRole("heading", { level: 1, name: `Achat — ${supplier}` })).toBeVisible();
  await expect(page.getByText(/378/).first()).toBeVisible();
  await expect(page.getByText("Charge créée")).toHaveCount(1);
  await shot(page, "purchases-detail");

  await page.getByRole("button", { name: "Ajouter un paiement" }).click();
  const pay = page.getByRole("dialog");
  await expect(pay.getByRole("radio", { name: "Solder" })).toBeChecked();
  await pay.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page.getByText(/Paiement de .*378.* enregistré/)).toBeVisible();
  await expect(page.getByText("Soldé").first()).toBeVisible();
  await expect(page.getByText("Charge créée")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Ajouter un paiement" })).toHaveCount(0);

  expect(await stockAt(db, store!.id, category!.id)).toBe(before + 2);
  const { data: payments } = await db.from("supplier_payments").select("id, amount").eq("purchase_id", purchaseId).order("created_at");
  expect(payments?.map((p) => p.amount)).toEqual([162, 378]);
  const { count } = await db.from("charges").select("id", { count: "exact", head: true }).in("supplier_payment_id", payments!.map((p) => p.id));
  expect(count).toBe(2);

  await page.goto("/fr/purchases");
  await expect(page.getByRole("row").filter({ hasText: supplier })).toBeVisible();
  await shot(page, "purchases-list");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/fr/purchases/${purchaseId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shot(page, "purchases-detail-mobile");
  expect(hydration).toEqual([]);

  // Leave dev tidy: archive the test supplier.
  const { data: created } = await db.from("suppliers").select("id").eq("name", supplier).single();
  await db.from("suppliers").update({ is_archived: true }).eq("id", created!.id);
});

test("secretary: Access denied on purchasing", async ({ page }) => {
  await signIn(page, "secretary");
  await page.goto("/fr/purchases");
  await expect(page.getByText("Accès non autorisé")).toBeVisible();
});

test("phone width: the new purchase form fits the screen, from its title to its save button", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, "admin");
  await page.goto("/fr/purchases");
  await page.getByRole("button", { name: "Nouvel achat" }).first().click();
  const form = page.getByRole("dialog");
  // The sheet used to grow past the top of the screen, hiding the supplier field (2026-11-20).
  await expect(form.getByRole("heading", { name: "Nouvel achat" })).toBeInViewport();
  await expect(form.getByRole("combobox", { name: "Fournisseur" })).toBeInViewport();
  await expect(form.getByRole("button", { name: "Enregistrer l'achat" })).toBeInViewport();
  // Measured once the slide-in animation is over.
  await expect.poll(async () => {
    const box = await form.boundingBox();
    return box && box.y >= 0 && box.y + box.height <= 812 + 1;
  }).toBe(true);
  await shot(page, "purchases-new-phone");
});
