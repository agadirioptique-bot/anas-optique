import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect as baseExpect, test, type Locator, type Page } from "@playwright/test";

/**
 * Stock page against the DEV project (SPEC §8, phase 7): the secretary sees her store read only
 * (history included); the super admin adjusts a count and transfers between the two test stores.
 * Accounts come from `npm run e2e:accounts`. Screenshots go to test-results/screens/.
 */
const file = join(process.cwd(), "e2e/.auth/accounts.json");
const accounts = existsSync(file)
  ? (JSON.parse(readFileSync(file, "utf8")) as {
      secretary: { email: string; password: string };
      admin: { email: string; password: string };
      frameName: string;
    })
  : null;

test.skip(!accounts, "run `npm run e2e:accounts` first");
// A dev server (next dev) can take several seconds per page or action on a busy machine.
test.describe.configure({ mode: "serial", timeout: 180_000 });
const expect = baseExpect.configure({ timeout: 30_000 });

const STORE_A = "Test Succursale A";
const STORE_B = "Test Succursale B";

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });

async function signIn(page: Page, who: "secretary" | "admin") {
  const { email, password } = accounts![who];
  await page.goto("/fr/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("form").getByRole("button").click();
  await expect(page).toHaveURL(who === "admin" ? /\/fr\/dashboard$/ : /\/fr\/orders$/, { timeout: 60_000 });
}

/** Collects React hydration errors (e.g. server and browser formatting a time differently). */
function watchHydration(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /hydrat/i.test(msg.text())) errors.push(msg.text().slice(0, 300));
  });
  page.on("pageerror", (err) => {
    if (/hydrat/i.test(err.message)) errors.push(err.message.slice(0, 300));
  });
  return errors;
}

const frameRow = (page: Page) => page.getByRole("row").filter({ hasText: accounts!.frameName });

/** Dev holds many test categories: narrow the table with the search box. */
async function findFrame(page: Page): Promise<Locator> {
  await page.getByRole("searchbox", { name: "Rechercher une catégorie…" }).fill(accounts!.frameName);
  const row = frameRow(page);
  await expect(row).toBeVisible();
  return row;
}

async function quantity(row: Locator): Promise<number> {
  return parseInt((await row.locator("td").nth(2).innerText()).trim(), 10);
}

test("secretary: her store only, read only, history drawer", async ({ page }) => {
  const hydration = watchHydration(page);
  await signIn(page, "secretary");
  await page.goto("/fr/stock");
  await expect(page.getByRole("heading", { level: 1, name: "Stock" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Transferts" })).toHaveCount(0);
  await expect(page.getByText("Catégories suivies")).toBeVisible();
  await expect(page.getByText(/DH/)).toHaveCount(0);

  const row = await findFrame(page);
  await expect(row.getByRole("button", { name: /Ajuster au comptage/ })).toHaveCount(0);
  await shot(page, "stock-secretary");

  await row.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Historique des mouvements")).toBeVisible();
  await expect(drawer.getByText("Achat").first()).toBeVisible();
  await shot(page, "stock-secretary-history");

  await page.setViewportSize({ width: 375, height: 812 });
  await page.keyboard.press("Escape");
  await shot(page, "stock-secretary-mobile");
  expect(hydration).toEqual([]);
});

test("super admin: adjust to a count, then transfer between stores", async ({ page }) => {
  const hydration = watchHydration(page);
  await signIn(page, "admin");
  await page.goto("/fr/stock");
  await page.getByRole("tab", { name: STORE_A }).click();
  const row = await findFrame(page);
  const before = await quantity(row);
  await shot(page, "stock-admin");

  // Adjust: counted = current + 1.
  await row.getByRole("button", { name: `Ajuster au comptage · ${accounts!.frameName}` }).click();
  const adjust = page.getByRole("dialog");
  await expect(adjust.getByText("Ajuster au stock compté")).toBeVisible();
  await adjust.getByRole("button", { name: "Ajouter 1" }).click();
  await expect(adjust.getByText("+1")).toBeVisible();
  await shot(page, "stock-admin-adjust");
  await adjust.getByRole("button", { name: "Enregistrer le comptage" }).click();
  await expect(page.getByText(`${accounts!.frameName} : stock ajusté à ${before + 1}`)).toBeVisible();
  await expect.poll(() => quantity(row)).toBe(before + 1);

  await row.getByRole("button", { name: `Historique · ${accounts!.frameName}` }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Ajustement").first()).toBeVisible();
  await expect(drawer.getByText(`= ${before + 1}`).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // Transfer 1 back out to store B: store A ends where it started.
  await row.getByRole("button", { name: `Transférer · ${accounts!.frameName}` }).click();
  const transfer = page.getByRole("dialog");
  await expect(transfer.getByText("Nouveau transfert")).toBeVisible();
  await transfer.getByRole("combobox", { name: "Vers" }).click();
  await page.getByRole("option", { name: STORE_B }).click();
  await shot(page, "stock-admin-transfer");
  await transfer.getByRole("button", { name: /^Transférer/ }).click();
  await expect(page.getByText(`1 article transféré de ${STORE_A} vers ${STORE_B}`)).toBeVisible();
  await expect.poll(() => quantity(row)).toBe(before);

  await page.goto("/fr/stock/transfers");
  await expect(page.getByRole("heading", { level: 1, name: "Transferts" })).toBeVisible();
  const latest = page.getByRole("row").filter({ hasText: accounts!.frameName }).first();
  await expect(latest).toBeVisible();
  // Times are formatted in the browser only (Node's bundled tz data may be out of date).
  await expect(latest.getByRole("cell").first()).toHaveText(/\d{2}:\d{2}/);
  await page.reload();
  await expect(latest.getByRole("cell").first()).toHaveText(/\d{2}:\d{2}/);
  expect(hydration).toEqual([]);
  await shot(page, "stock-transfers");

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/fr/stock");
  await shot(page, "stock-admin-mobile");
});
