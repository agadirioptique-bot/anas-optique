import { expect, test, type BrowserContext } from "@playwright/test";

async function signInAs(context: BrowserContext, role: "super_admin" | "secretary" | "signed_out") {
  await context.addCookies([{ name: "opticor-dev-role", value: role, url: "http://localhost:3100" }]);
}

test("super admin lands on the dashboard and sees every page", async ({ page, context }) => {
  await signInAs(context, "super_admin");
  await page.goto("/");
  await expect(page).toHaveURL(/\/fr\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
  const nav = page.getByTestId("sidebar").getByRole("navigation");
  await expect(nav.getByRole("link")).toHaveCount(8);
});

test("secretary only sees Orders, Clients and Stock and is denied the dashboard", async ({ page, context }) => {
  await signInAs(context, "secretary");
  await page.goto("/fr");
  await expect(page).toHaveURL(/\/fr\/orders$/);
  const nav = page.getByTestId("sidebar").getByRole("navigation");
  await expect(nav.getByRole("link")).toHaveText(["Commandes", "Clients", "Stock"]);

  await page.goto("/fr/dashboard");
  await expect(page.getByTestId("access-denied")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Accès non autorisé" })).toBeVisible();
});

test("signed-out visitors are sent to the login page", async ({ page, context }) => {
  await signInAs(context, "signed_out");
  await page.goto("/fr/orders");
  await expect(page).toHaveURL(/\/fr\/login$/);
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
});

test("English locale renders English strings", async ({ page, context }) => {
  await signInAs(context, "super_admin");
  await page.goto("/en/orders");
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await expect(page).toHaveTitle("Orders · OPTICOR");
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows the bottom bar and hides the sidebar", async ({ page, context }) => {
    await signInAs(context, "secretary");
    await page.goto("/fr/orders");
    await expect(page.getByTestId("mobile-nav")).toBeVisible();
    await expect(page.getByTestId("sidebar")).toBeHidden();
    await expect(page.getByTestId("mobile-nav").getByRole("link", { name: "Notifications" })).toBeVisible();
  });
});
