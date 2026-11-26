import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Real sign-in against the dev Supabase project. Accounts come from `npm run e2e:accounts`
 * (e2e/.auth/accounts.json, like the other specs); `.env.local` E2E_* variables still override them.
 * Tests that need an account are skipped without one.
 */
const file = join(process.cwd(), "e2e/.auth/accounts.json");
type Account = { email?: string; password?: string };
const provisioned = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { admin: Account; secretary: Account }) : null;
const ACCOUNTS = {
  super_admin: {
    email: process.env.E2E_SUPER_ADMIN_EMAIL ?? provisioned?.admin.email,
    password: process.env.E2E_SUPER_ADMIN_PASSWORD ?? provisioned?.admin.password,
  },
  secretary: {
    email: process.env.E2E_SECRETARY_EMAIL ?? provisioned?.secretary.email,
    password: process.env.E2E_SECRETARY_PASSWORD ?? provisioned?.secretary.password,
  },
};
type Role = keyof typeof ACCOUNTS;
const hasAccount = (role: Role) => !!ACCOUNTS[role].email && !!ACCOUNTS[role].password;
// A dev server (next dev) can take several seconds per page on a busy machine.
test.describe.configure({ timeout: 120_000 });

async function signInAs(page: Page, role: Role, locale: "fr" | "en" = "fr") {
  const { email, password } = ACCOUNTS[role];
  await page.goto(`/${locale}/login`);
  await page.locator("#email").fill(email!);
  await page.locator("#password").fill(password!);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(role === "super_admin" ? /\/dashboard$/ : /\/orders$/, { timeout: 60_000 });
}

test("signed-out visitors are sent to the login page", async ({ page }) => {
  await page.goto("/fr/orders");
  await expect(page).toHaveURL(/\/fr\/login$/);
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  await page.goto("/fr/dashboard");
  await expect(page).toHaveURL(/\/fr\/login$/);
});

test("wrong credentials show an error", async ({ page }) => {
  await page.goto("/fr/login");
  await page.locator("#email").fill("nobody@example.com");
  await page.locator("#password").fill("not-the-password");
  // The eye shows the password, then hides it again.
  const eye = page.getByRole("button", { name: "Afficher le mot de passe" });
  await eye.click();
  await expect(page.locator("#password")).toHaveAttribute("type", "text");
  await expect(eye).toHaveAttribute("aria-pressed", "true");
  await eye.click();
  await expect(page.locator("#password")).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("E-mail ou mot de passe incorrect.");
});

test("an invalid email link lands on the login page with a message", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=bogus&type=invite&next=/set-password");
  await expect(page).toHaveURL(/\/fr\/login\?error=linkInvalid$/);
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
});

test("super admin lands on the dashboard and sees every page", async ({ page }) => {
  test.skip(!hasAccount("super_admin"), "run `npm run e2e:accounts` first");
  await signInAs(page, "super_admin");
  await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
  const nav = page.getByTestId("sidebar").getByRole("navigation");
  await expect(nav.getByRole("link")).toHaveCount(8);
  await page.goto("/fr/settings?tab=users");
  await expect(page.getByTestId("users-list")).toBeVisible();
});

test("secretary only sees Orders, Clients and Stock and is denied admin pages", async ({ page }) => {
  test.skip(!hasAccount("secretary"), "run `npm run e2e:accounts` first");
  await signInAs(page, "secretary");
  const nav = page.getByTestId("sidebar").getByRole("navigation");
  await expect(nav.getByRole("link")).toHaveText(["Commandes", "Clients", "Stock"]);

  for (const path of ["/fr/dashboard", "/fr/settings", "/fr/charges"]) {
    await page.goto(path);
    await expect(page.getByTestId("access-denied")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Accès non autorisé" })).toBeVisible();
  }
  await expect(page.getByTestId("users-list")).toHaveCount(0);
});

test("English locale renders English strings", async ({ page }) => {
  test.skip(!hasAccount("super_admin"), "run `npm run e2e:accounts` first");
  await signInAs(page, "super_admin", "en");
  await page.goto("/en/orders");
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await expect(page).toHaveTitle("Orders · OPTICOR");
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows the bottom bar and hides the sidebar", async ({ page }) => {
    test.skip(!hasAccount("secretary"), "run `npm run e2e:accounts` first");
    await signInAs(page, "secretary");
    await expect(page.getByTestId("mobile-nav")).toBeVisible();
    await expect(page.getByTestId("sidebar")).toBeHidden();
    await expect(page.getByTestId("mobile-nav").getByRole("link", { name: "Notifications" })).toBeVisible();
  });

  test("new order: the wizard's bottom bar is not covered by the bottom nav", async ({ page }) => {
    test.skip(!hasAccount("secretary"), "run `npm run e2e:accounts` first");
    await signInAs(page, "secretary");
    await page.goto("/fr/orders/new");
    await expect(page.getByRole("heading", { level: 1, name: "Nouvelle commande" })).toBeVisible();
    await expect(page.getByTestId("mobile-nav")).toHaveCount(0);
    // A trial click fails if another element (the nav) would receive the tap.
    await page.getByRole("button", { name: "Suivant" }).click({ trial: true });
  });
});
