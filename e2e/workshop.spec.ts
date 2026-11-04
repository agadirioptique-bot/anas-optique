import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect as baseExpect, test, type Page } from "@playwright/test";

/**
 * Workshop against the DEV project (SPEC §8, phase 10): a secretary creates an order (client's own
 * frame, lens type + treatment); the super admin finds its card in the workshop queue and moves it
 * confirmed → in workshop → prepared → in store with the main button; the card leaves the queue and
 * the workshop badge goes down once it is prepared. Secretaries are locked out. Accounts come from `npm run e2e:accounts`.
 */
const file = join(process.cwd(), "e2e/.auth/accounts.json");
const accounts = existsSync(file)
  ? (JSON.parse(readFileSync(file, "utf8")) as {
      secretary: { email: string; password: string };
      admin: { email: string; password: string };
      storePrefix: string;
    })
  : null;

test.skip(!accounts, "run `npm run e2e:accounts` first");
// A dev server (next dev) can take several seconds per page or action on a busy machine.
test.describe.configure({ mode: "serial", timeout: 240_000 });
const expect = baseExpect.configure({ timeout: 30_000 });

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

/** Wizard: own frame, first lens type, first treatment. Returns the order number and the chosen labels. */
async function createOrder(page: Page) {
  const slip = String(Date.now()).slice(-8);
  const phone = `06${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;
  await page.goto("/fr/orders/new");
  await page.getByTestId("slip-number").fill(slip);
  await expect(page.getByText("Numéro disponible")).toBeVisible();
  await page.getByRole("radio", { name: "Nouveau client" }).click();
  await page.locator("#new-client-name").fill(`Atelier E2E ${slip}`);
  await page.locator("#new-client-phone").fill(phone);
  await page.getByTestId("wizard-next").click();

  await page.locator("#rx-od-sph").fill("-2.25");
  await page.locator("#rx-od-cyl").fill("-0.75");
  await page.locator("#rx-od-axis").fill("180");
  await page.locator("#rx-og-sph").fill("-2");
  await page.locator("#rx-og-sph").blur();
  await page.getByTestId("wizard-next").click();

  await page.locator("#own-frame").click();
  const lens = page.getByRole("radiogroup", { name: "Type de verres" }).getByRole("radio").first();
  const lensLabel = (await lens.textContent())!.trim();
  await lens.click();
  const treatment = page.getByRole("toolbar", { name: "Traitements" }).getByRole("button").first();
  const treatmentLabel = (await treatment.textContent())!.trim();
  await treatment.click();
  await page.locator("#order-total").fill("1200");
  await page.getByTestId("wizard-next").click();

  await expect(page.getByTestId("order-created")).toBeVisible();
  const text = await page.getByTestId("order-created").textContent();
  const number = text?.match(new RegExp(`${accounts!.storePrefix}-\\d+`))?.[0];
  expect(number).toBeTruthy();
  return { number: number!, lensLabel, treatmentLabel };
}

const badge = (page: Page) => page.getByRole("complementary").getByRole("link", { name: /Atelier/ });

/**
 * The badge counts confirmed + in-workshop orders of the shown scope. Other specs create orders at the
 * same time, so compare it with the cards of the same render (not with an earlier number).
 */
async function expectBadgeMatchesQueue(page: Page) {
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Atelier" })).toBeVisible();
  const waiting = await page.getByRole("main").getByRole("button", { name: /Envoyer à l'atelier|Marquer comme préparée/ }).count();
  await expect(badge(page)).toHaveText(waiting ? new RegExp(`(^|\\D)${waiting}(\\D|$)`) : /^\D*$/);
}

test("super admin moves an order through the workshop with the main button", async ({ page }) => {
  await signIn(page, "secretary");
  const { number, lensLabel, treatmentLabel } = await createOrder(page);
  await page.context().clearCookies();

  const hydration = watchHydration(page);
  await signIn(page, "admin");
  await page.goto("/fr/workshop");
  await expect(page.getByRole("heading", { level: 1, name: "Atelier" })).toBeVisible();
  const card = page.getByTestId(`workshop-card-${number}`);
  await expect(card).toBeVisible();
  await expect(card.getByText("Monture du client")).toBeVisible();
  await expect(card.getByText(lensLabel, { exact: true })).toBeVisible();
  await expect(card.getByText(treatmentLabel, { exact: true })).toBeVisible();
  await expect(card.getByText(/−2\.25 \(−0\.75 × 180°\)/)).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await shot(page, "workshop");

  await card.getByRole("button", { name: /Envoyer à l'atelier/ }).click();
  await expect(card.getByText("À l’atelier").or(card.getByText("À l'atelier")).first()).toBeVisible();
  // The badge counts confirmed + in workshop: the pair still counts until it is prepared.
  await expectBadgeMatchesQueue(page);

  await card.getByRole("button", { name: /Marquer comme préparée/ }).click();
  await expect(card.getByRole("button", { name: /Arrivée en succursale/ })).toBeVisible();
  await expectBadgeMatchesQueue(page);
  await card.getByRole("button", { name: /Arrivée en succursale/ }).click();
  await expect(page.getByTestId(`workshop-card-${number}`)).toHaveCount(0);

  await page.goto("/fr/orders?view=list");
  await page.getByTestId("orders-search").fill(number);
  await page.getByRole("link", { name: number }).first().click();
  await expect(page.getByTestId("order-status")).toContainText("En succursale");

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/fr/workshop");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shot(page, "workshop-mobile");
  expect(hydration).toEqual([]);
});

test("secretary: Access denied on the workshop", async ({ page }) => {
  await signIn(page, "secretary");
  await page.goto("/fr/workshop");
  await expect(page.getByText("Accès non autorisé")).toBeVisible();
});
