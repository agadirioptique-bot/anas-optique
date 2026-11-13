import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect as baseExpect, test, type Page } from "@playwright/test";

/**
 * Main flow against the DEV project (SPEC §8): a secretary creates an order, moves it through the
 * workshop to the store, collects the balance and delivers it; a super admin cancels another order.
 * Accounts come from `npm run e2e:accounts` (e2e/.auth/accounts.json, git-ignored).
 * Screenshots go to test-results/screens/ for the visual review.
 */
const file = join(process.cwd(), "e2e/.auth/accounts.json");
const accounts = existsSync(file)
  ? (JSON.parse(readFileSync(file, "utf8")) as {
      secretary: { email: string; password: string };
      admin: { email: string; password: string };
      storePrefix: string;
      frameName: string;
    })
  : null;

test.skip(!accounts, "run `npm run e2e:accounts` first");
// A dev server (next dev) can take several seconds per page on a busy machine (same as the other specs).
test.describe.configure({ mode: "serial", timeout: 180_000 });
const expect = baseExpect.configure({ timeout: 30_000 });

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });

async function signIn(page: Page, who: "secretary" | "admin") {
  const { email, password } = accounts![who];
  await page.goto("/fr/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("form").getByRole("button").click();
  await expect(page).toHaveURL(who === "admin" ? /\/fr\/dashboard$/ : /\/fr\/orders$/);
}

/** Creates an order through the wizard and returns its display number (e.g. TSA-1234567). */
async function createOrder(page: Page, opts: { ownFrame: boolean; screenshots?: boolean }) {
  const slip = String(Date.now()).slice(-8);
  const phone = `06${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;
  await page.goto("/fr/orders/new");

  // Step 1 — slip + new client
  await page.getByTestId("slip-number").fill(slip);
  await expect(page.getByText("Numéro disponible")).toBeVisible();
  await page.getByRole("radio", { name: "Nouveau client" }).click();
  await page.locator("#new-client-name").fill(`Client E2E ${slip}`);
  await page.locator("#new-client-phone").fill(phone);
  if (opts.screenshots) await shot(page, "wizard-1-client");
  await page.getByTestId("wizard-next").click();

  // Step 2 — prescription
  await page.locator("#rx-od-sph").fill("-1.25");
  await page.locator("#rx-od-cyl").fill("-0.5");
  await page.locator("#rx-od-axis").fill("90");
  await page.locator("#rx-og-sph").fill("-1");
  await page.locator("#rx-og-sph").blur();
  if (opts.screenshots) await shot(page, "wizard-2-measures");
  await page.getByTestId("wizard-next").click();

  // Step 3 — products & payment
  if (opts.ownFrame) await page.locator("#own-frame").click();
  else await page.getByTestId(`frame-${accounts!.frameName}`).click();
  await page.getByRole("radiogroup", { name: "Type de verres" }).getByRole("radio").first().click();
  await page.locator("#order-total").fill("1500");
  await page.getByRole("button", { name: "30 %" }).click();
  if (opts.screenshots) await shot(page, "wizard-3-products");
  await page.getByTestId("wizard-next").click();

  await expect(page.getByTestId("order-created")).toBeVisible();
  const text = await page.getByTestId("order-created").textContent();
  const number = text?.match(new RegExp(`${accounts!.storePrefix}-\\d+`))?.[0];
  expect(number).toBeTruthy();
  if (opts.screenshots) await shot(page, "wizard-4-success");
  return number!;
}

async function openOrder(page: Page, number: string) {
  await page.goto("/fr/orders?view=list");
  await page.getByTestId("orders-search").fill(number);
  await page.getByRole("link", { name: number }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(number);
}

test("secretary: create → workshop → prepared → in store → collect → delivered", async ({ page }) => {
  await signIn(page, "secretary");
  const number = await createOrder(page, { ownFrame: false, screenshots: true });

  await page.goto("/fr/orders");
  // Find it by number: the board shows at most 40 cards per column, and dev keeps older test orders.
  await page.getByTestId("orders-search").fill(number);
  await expect(page.getByTestId(`order-card-${number}`)).toBeVisible();
  await expect(page.getByTestId("column-confirmed").getByTestId(`order-card-${number}`)).toBeVisible();
  await shot(page, "board");

  await openOrder(page, number);
  for (const [button, status] of [
    ["Envoyer à l'atelier", "À l’atelier"],
    ["Marquer comme préparée", "Préparée"],
    ["Arrivée en succursale", "En succursale"],
  ] as const) {
    await page.getByTestId("next-step").filter({ hasText: button }).click();
    await expect(page.getByTestId("order-status")).toContainText(status);
  }
  // Arrived in store: the secretary is offered to tell the admin (e2e/notify-admin.spec.ts); skip it here.
  await page.getByTestId("notify-admin-later").click();
  await expect(page.getByTestId("notify-admin")).toBeHidden();
  await expect(page.getByRole("link", { name: "Prévenir sur WhatsApp" })).toBeVisible();
  await shot(page, "detail-in-store");

  await page.getByTestId("collect").click();
  await page.getByTestId("collect-confirm").click();
  await expect(page.getByTestId("order-status")).toContainText("Livrée");
  await expect(page.getByTestId("detail-balance")).toContainText("0");
  await shot(page, "detail-delivered");

  await page.goto("/fr/clients");
  await shot(page, "clients");
});

test("super admin cancels an order with a refund", async ({ page }) => {
  await signIn(page, "secretary");
  const number = await createOrder(page, { ownFrame: true });
  await page.context().clearCookies();

  await signIn(page, "admin");
  await openOrder(page, number);
  await page.getByTestId("order-menu").click();
  await page.getByRole("menuitem", { name: "Annuler la commande" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Annuler la commande" }).click();
  await expect(page.getByTestId("order-status")).toContainText("Annulée");
  await shot(page, "detail-cancelled");
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("board and wizard on a phone", async ({ page }) => {
    await signIn(page, "secretary");
    await shot(page, "mobile-board");
    await page.goto("/fr/orders/new");
    await shot(page, "mobile-wizard");
    await page.goto("/fr/clients");
    await shot(page, "mobile-clients");
  });
});
