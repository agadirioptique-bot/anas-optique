import { expect, test, type Page } from "@playwright/test";

/**
 * Real sign-in against the dev Supabase project. Test accounts come from .env.local
 * (E2E_SUPER_ADMIN_EMAIL / _PASSWORD, E2E_SECRETARY_EMAIL / _PASSWORD); tests that need one are skipped without it.
 */
const ACCOUNTS = {
  super_admin: { email: process.env.E2E_SUPER_ADMIN_EMAIL, password: process.env.E2E_SUPER_ADMIN_PASSWORD },
  secretary: { email: process.env.E2E_SECRETARY_EMAIL, password: process.env.E2E_SECRETARY_PASSWORD },
};
type Role = keyof typeof ACCOUNTS;
const hasAccount = (role: Role) => !!ACCOUNTS[role].email && !!ACCOUNTS[role].password;

async function signInAs(page: Page, role: Role, locale: "fr" | "en" = "fr") {
  const { email, password } = ACCOUNTS[role];
  await page.goto(`/${locale}/login`);
  await page.locator("#email").fill(email!);
  await page.locator("#password").fill(password!);
  await page.locator("form").getByRole("button").click();
  await expect(page).toHaveURL(role === "super_admin" ? /\/dashboard$/ : /\/orders$/);
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
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("alert")).toHaveText("E-mail ou mot de passe incorrect.");
});

test("an invalid email link lands on the login page with a message", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=bogus&type=invite&next=/set-password");
  await expect(page).toHaveURL(/\/fr\/login\?error=linkInvalid$/);
  await expect(page.getByRole("alert")).toBeVisible();
});

test("super admin lands on the dashboard and sees every page", async ({ page }) => {
  test.skip(!hasAccount("super_admin"), "E2E_SUPER_ADMIN_* not set");
  await signInAs(page, "super_admin");
  await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
  const nav = page.getByTestId("sidebar").getByRole("navigation");
  await expect(nav.getByRole("link")).toHaveCount(8);
  await page.goto("/fr/settings?tab=users");
  await expect(page.getByTestId("users-list")).toBeVisible();
});

test("secretary only sees Orders, Clients and Stock and is denied admin pages", async ({ page }) => {
  test.skip(!hasAccount("secretary"), "E2E_SECRETARY_* not set");
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
  test.skip(!hasAccount("super_admin"), "E2E_SUPER_ADMIN_* not set");
  await signInAs(page, "super_admin", "en");
  await page.goto("/en/orders");
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await expect(page).toHaveTitle("Orders · OPTICOR");
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows the bottom bar and hides the sidebar", async ({ page }) => {
    test.skip(!hasAccount("secretary"), "E2E_SECRETARY_* not set");
    await signInAs(page, "secretary");
    await expect(page.getByTestId("mobile-nav")).toBeVisible();
    await expect(page.getByTestId("sidebar")).toBeHidden();
    await expect(page.getByTestId("mobile-nav").getByRole("link", { name: "Notifications" })).toBeVisible();
  });
});
