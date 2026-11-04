import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect as baseExpect, test, type Page } from "@playwright/test";

/**
 * Dashboard against the DEV project (SPEC §8–9, phase 11): filters live in the URL, Montant encaissé
 * is the hero card on Today, "Aucune" comparison hides the deltas, charts and widgets render.
 * The KPI formulas themselves are tested in tests/db/dashboard.test.ts.
 */
const file = join(process.cwd(), "e2e/.auth/accounts.json");
const accounts = existsSync(file)
  ? (JSON.parse(readFileSync(file, "utf8")) as { secretary: { email: string; password: string }; admin: { email: string; password: string } })
  : null;

test.skip(!accounts, "run `npm run e2e:accounts` first");
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
  await page.locator("form").getByRole("button").click();
  await expect(page).toHaveURL(who === "admin" ? /\/fr\/dashboard$/ : /\/fr\/orders$/, { timeout: 60_000 });
}

const firstCard = (page: Page) => page.locator("[data-testid^=kpi-]").first();

test("super admin: filters in the URL, hero card, comparison, charts and widgets", async ({ page }) => {
  const hydration: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /hydrat/i.test(msg.text())) hydration.push(msg.text().slice(0, 300));
  });
  await signIn(page, "admin");
  await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();

  // Default: this month, CA is the hero card, deltas vs M−1.
  await expect(firstCard(page)).toHaveAttribute("data-testid", "kpi-revenue");
  // Each card shows its change "vs M−1" (or "— vs M−1" when the previous value is 0).
  await expect(page.getByTestId("kpi-revenue").getByText("vs M−1")).toBeVisible();
  await expect(page.getByTestId("dashboard-range")).toContainText("comparé à");
  await expect(page.getByTestId("chart-revenue")).toBeVisible();
  for (const widget of ["widget-pickup", "widget-pending", "widget-low-stock", "kpi-more"]) await expect(page.getByTestId(widget)).toBeVisible();
  await shot(page, "dashboard");

  // Today: Montant encaissé becomes the hero card.
  await page.getByRole("group", { name: "Période" }).getByRole("button", { name: "Aujourd'hui" }).click();
  await expect(page).toHaveURL(/period=today/);
  await expect(firstCard(page)).toHaveAttribute("data-testid", "kpi-collected");

  // No comparison: no delta, no "compared with".
  await page.getByRole("radio", { name: "Aucune" }).click();
  await expect(page).toHaveURL(/compare=none/);
  await expect(page.getByTestId("kpi-delta")).toHaveCount(0);
  await expect(page.getByTestId("kpi-collected").getByText("Sans comparaison")).toBeVisible();
  await expect(page.getByTestId("dashboard-range")).not.toContainText("comparé à");

  // Store filter.
  await page.getByRole("combobox", { name: "Succursale", exact: true }).click();
  await page.getByRole("option", { name: "Toutes les succursales" }).click();
  await expect(page).toHaveURL(/store=all/);

  // Custom range.
  await page.getByRole("group", { name: "Période" }).getByRole("button", { name: "Personnalisé" }).click();
  await expect(page.getByLabel("Du")).toBeVisible();
  await expect(page).toHaveURL(/period=custom/);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/fr/dashboard?store=all");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await shot(page, "dashboard-mobile");
  expect(hydration).toEqual([]);
});

test("secretary: Access denied on the dashboard", async ({ page }) => {
  await signIn(page, "secretary");
  await page.goto("/fr/dashboard");
  await expect(page.getByText("Accès non autorisé")).toBeVisible();
});
