// Screenshots for the user guide (docs/guide_emploi.pdf), taken on the dev server with the demo
// accounts from scripts/guide/seed-demo.mjs.
//
//   node scripts/guide/screenshots.mjs        # GUIDE_BASE_URL=http://localhost:3000 by default
//
// Writes reports/guide/shots/*.jpg (git-ignored). A step that fails is logged and skipped, so one
// changed label doesn't lose the whole run. Creates one order through the wizard (secretary part).
// Dev also holds automated-test rows ("E2E …", "Test …"): they are removed from the page (not from
// the database) just before each capture, and the admin works on the Succursale Maârif scope.
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.GUIDE_BASE_URL ?? "http://localhost:3000";
// GUIDE_LOCALE=en takes the screenshots for the English guide (reports/guide/shots-en/).
const LOCALE = process.env.GUIDE_LOCALE === "en" ? "en" : "fr";
const OUT = join(process.cwd(), LOCALE === "en" ? "reports/guide/shots-en" : "reports/guide/shots");
/** The interface labels the script clicks on (messages/*.json), and the demo client typed in the wizard. */
const T = {
  fr: {
    slipFree: "Numéro disponible", newClient: "Nouveau client", lensType: "Type de verres", treatments: "Traitements",
    antiReflective: /Anti-reflet/, history: "Historique", transfer: "Transférer", adjust: "Ajuster au comptage",
    cancelOrder: "Annuler la commande", newPurchase: "Nouvel achat", viewPurchase: "Voir l'achat", purchaseTitle: /Achat/,
    addPayment: "Ajouter un paiement", newCharge: "Nouvelle charge", userMenu: /Menu utilisateur/, wizardClient: "Ghita Squalli",
  },
  en: {
    slipFree: "Number available", newClient: "New client", lensType: "Lens type", treatments: "Treatments",
    antiReflective: /Anti-reflective/, history: "History", transfer: "Transfer", adjust: "Adjust to count",
    cancelOrder: "Cancel the order", newPurchase: "New purchase", viewPurchase: "View purchase", purchaseTitle: /Purchase/,
    addPayment: "Add a payment", newCharge: "New charge", userMenu: /User menu/, wizardClient: "Sofia Bennis",
  },
}[LOCALE];
mkdirSync(OUT, { recursive: true });
const accounts = JSON.parse(readFileSync(join(process.cwd(), "e2e/.auth/guide-accounts.json"), "utf8"));

const browser = await chromium.launch();
const failed = [];

async function session(who, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1.5, locale: LOCALE === "en" ? "en-US" : "fr-FR", colorScheme: "light", reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  await page.goto(`${BASE}/${LOCALE}/login`);
  if (who) {
    await page.locator("#email").fill(accounts[who].email);
    await page.locator("#password").fill(accounts[who].password);
    await page.locator("form").getByRole("button").click();
    await page.waitForURL(new RegExp(`/${LOCALE}/(dashboard|orders)$`), { timeout: 90_000 });
  }
  return page;
}

/** Waits for the page's own content (no skeleton, no spinner, fonts loaded). */
async function settle(page) {
  await page.locator('[role="status"][aria-live="polite"]').first().waitFor({ state: "detached", timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
}

/** Paths are written with /fr/; the locale of the run replaces it. */
async function go(page, path) {
  await page.goto(`${BASE}${path.replace(/^\/fr\//, `/${LOCALE}/`)}`);
  await page.locator("h1").first().waitFor();
  await settle(page);
}

/** Hides the rows the automated tests left on dev (rows, list items, cards, options, tabs). */
async function scrub(page) {
  await page.evaluate(() => {
    const TEST = /\bE2E\b|\bTest\b|\bKPI\b|Doublon|Atelier E2E|Fournisseur (lab|charge|cap|invalid|archived|owed|dup|test|KPI)|Loyer test|\bmw[0-9a-z]{6}\b|opticor-(test|e2e)|tiima|Client Test|\bali\b|lilo|aakouhar/;
    const SELECTOR = 'tr, li, [role="row"], [role="option"], [role="tab"], [data-testid^="order-card-"], [data-testid^="workshop-card-"]';
    // Names typed in fields (settings lists) count as text too.
    const text = (el) => (el.textContent ?? "") + " " + [...el.querySelectorAll("input, textarea")].map((i) => i.value).join(" ");
    const matched = [...document.querySelectorAll(SELECTOR)].filter((el) => TEST.test(text(el)));
    // Innermost matches only: a list item holding a whole list keeps its other rows.
    for (const el of matched) if (![...el.querySelectorAll(SELECTOR)].some((child) => matched.includes(child))) el.remove();
    for (const el of document.querySelectorAll(SELECTOR)) if (!(el.textContent ?? "").trim() && !el.querySelector("img, svg, input")) el.remove();
    // The Next.js dev-tools badge (dev server only).
    for (const el of document.querySelectorAll("nextjs-portal")) el.remove();
  });
}

// GUIDE_ONLY=regex re-takes only the matching screenshots (e.g. GUIDE_ONLY="s12|a09").
const ONLY = process.env.GUIDE_ONLY ? new RegExp(process.env.GUIDE_ONLY) : null;

async function shot(page, name, step, { fullPage = false, clip } = {}) {
  if (ONLY && !ONLY.test(name)) return;
  try {
    if (step) await step();
    await settle(page);
    await scrub(page);
    // Full page = a window as tall as the page (Playwright's fullPage repaints the fixed shell mid-page).
    const viewport = page.viewportSize();
    if (fullPage) {
      const height = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
      await page.setViewportSize({ width: viewport.width, height: Math.min(height, 5000) });
      await settle(page);
    }
    await page.screenshot({ path: join(OUT, `${name}.jpg`), type: "jpeg", quality: 82, clip, animations: "disabled", caret: "initial" });
    if (fullPage) await page.setViewportSize(viewport);
    console.log("ok  ", name);
  } catch (e) {
    failed.push(name);
    console.log("FAIL", name, String(e).split("\n")[0]);
    await page.keyboard.press("Escape").catch(() => {});
  }
}

const close = async (page) => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
};

// ---------------------------------------------------------------------------------------------
// Public pages
{
  const page = await session(null);
  await shot(page, "00-login", () => settle(page));
  await shot(page, "00-forgot", () => go(page, "/fr/forgot-password"));
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------
// Secretary (Salma Bennani, Succursale Maârif)
{
  const page = await session("secretary");
  await shot(page, "s01-orders-board", () => settle(page));
  await shot(page, "s02-orders-list", () => go(page, "/fr/orders?view=list"));
  await shot(page, "s03-search", async () => {
    await go(page, "/fr/orders");
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog").getByRole("combobox").fill("Khadija");
    await page.getByRole("dialog").getByRole("option").first().waitFor({ timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(800);
  });
  await close(page);

  // New order wizard
  await shot(page, "s04-wizard-client", async () => {
    await go(page, "/fr/orders/new");
    // A fresh bon number and phone on each run (they must be unique).
    await page.getByTestId("slip-number").fill(String(1300 + (Math.floor(Date.now() / 1000) % 700)));
    await page.getByText(T.slipFree).waitFor();
  });
  await shot(page, "s05-wizard-new-client", async () => {
    await page.getByRole("radio", { name: T.newClient }).click();
    await page.locator("#new-client-name").fill(T.wizardClient);
    await page.locator("#new-client-phone").fill(`0661 ${String(Date.now()).slice(-6, -4)} ${String(Date.now()).slice(-4, -2)} ${String(Date.now()).slice(-2)}`);
  });
  await shot(page, "s06-wizard-measures", async () => {
    await page.getByTestId("wizard-next").click();
    await page.locator("#rx-od-sph").fill("-1.75");
    await page.locator("#rx-od-cyl").fill("-0.5");
    await page.locator("#rx-od-axis").fill("90");
    await page.locator("#rx-og-sph").fill("-1.5");
    await page.locator("#rx-og-cyl").fill("-0.25");
    await page.locator("#rx-og-axis").fill("85");
    await page.locator("#rx-og-axis").blur();
  }, { fullPage: true });
  await shot(page, "s07-wizard-products", async () => {
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("frame-Catégorie B").click();
    await page.getByRole("radiogroup", { name: T.lensType }).getByRole("radio").first().click();
    await page.getByRole("toolbar", { name: T.treatments }).getByRole("button", { name: T.antiReflective }).click();
    await page.locator("#order-total").fill("1500");
    await page.getByRole("button", { name: "30 %" }).click();
  }, { fullPage: true });
  await shot(page, "s08-wizard-done", async () => {
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("order-created").waitFor();
  });

  // Order detail and collection (Khadija Chraibi, in store)
  await shot(page, "s09-order-detail", async () => {
    await go(page, "/fr/orders?view=list");
    await page.getByTestId("orders-search").fill("Khadija");
    await page.waitForTimeout(800);
    await page.getByRole("main").getByRole("link").filter({ hasText: /MRF-/ }).first().click();
    await page.getByTestId("order-status").waitFor();
  }, { fullPage: true });
  await shot(page, "s10-collect", async () => {
    await page.getByTestId("collect").click();
    await page.getByRole("dialog").waitFor();
  });
  await close(page);

  await shot(page, "s11-clients", () => go(page, "/fr/clients?sort=orders"));
  await shot(page, "s12-client-detail", async () => {
    await go(page, "/fr/clients?sort=orders");
    await page.getByRole("main").getByRole("searchbox").first().fill("Youssef");
    await page.waitForTimeout(2000); // the list filters as you type
    await page.getByRole("main").getByRole("link", { name: /Youssef El Amrani/ }).locator("visible=true").first().click();
    await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    await page.locator("h1").first().waitFor();
  }, { fullPage: true });
  await shot(page, "s13-new-client", async () => {
    await go(page, "/fr/clients");
    await page.getByRole("button", { name: T.newClient }).click();
    await page.getByRole("dialog").waitFor();
  });
  await close(page);

  await shot(page, "s14-stock", () => go(page, "/fr/stock"), { fullPage: true });
  await shot(page, "s15-stock-history", async () => {
    await page.getByRole("button", { name: new RegExp(`^${T.history} · Catégorie B`) }).first().click();
    await page.getByRole("dialog").waitFor();
    await page.getByRole("dialog").locator(".animate-spin").first().waitFor({ state: "detached", timeout: 30_000 }).catch(() => {});
  });
  await close(page);
  await shot(page, "s16-notifications", async () => {
    await go(page, "/fr/orders");
    await page.getByTestId("notification-bell").click();
    await page.waitForTimeout(1200);
  });
  await close(page);
  await shot(page, "s17-access-denied", () => go(page, "/fr/charges"));
  await page.context().close();
}

// Secretary on a phone
{
  const page = await session("secretary", { width: 390, height: 844 });
  await shot(page, "m01-phone-board", () => settle(page));
  await shot(page, "m02-phone-wizard", () => go(page, "/fr/orders/new"));
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------
// Super admin (Karim Alaoui) — top-bar scope: Succursale Maârif
{
  const page = await session("admin");
  await page.getByRole("banner").getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Succursale Maârif" }).click();
  // The choice is saved by a server action: wait until a fresh page shows it.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);
  await page.reload();
  await page.getByRole("banner").getByRole("combobox").first().filter({ hasText: "Succursale Maârif" }).waitFor({ timeout: 30_000 });
  await shot(page, "a01-dashboard-today", () => go(page, "/fr/dashboard?period=today"));
  await shot(page, "a02-dashboard-year", () => go(page, "/fr/dashboard?period=thisYear&compare=none"));
  await shot(page, "a03-dashboard-month", () => go(page, "/fr/dashboard?period=thisMonth"), { fullPage: true });
  await shot(page, "a04-store-selector", async () => {
    await go(page, "/fr/orders");
    await page.getByRole("banner").getByRole("combobox").first().click();
    await page.getByRole("listbox").waitFor();
  });
  await close(page);
  await shot(page, "a05-orders-board", () => go(page, "/fr/orders"));
  await shot(page, "a06-workshop", () => go(page, "/fr/workshop"), { fullPage: true });

  await shot(page, "a07-order-menu", async () => {
    await go(page, "/fr/orders?view=list");
    await page.getByTestId("orders-search").fill("Hamza");
    await page.waitForTimeout(800);
    await page.getByRole("main").getByRole("link").filter({ hasText: /MRF-/ }).first().click();
    await page.getByTestId("order-status").waitFor();
    await page.getByTestId("order-menu").click();
  });
  await shot(page, "a08-cancel-dialog", async () => {
    await page.getByRole("menuitem", { name: T.cancelOrder }).click();
    await page.getByRole("dialog").waitFor();
  });
  await close(page);

  await shot(page, "a09-client-admin", async () => {
    await go(page, "/fr/clients?segment=loyal&sort=orders");
    await page.getByRole("main").getByRole("searchbox").first().fill("Youssef");
    await page.waitForTimeout(2000); // the list filters as you type
    await page.getByRole("main").getByRole("link", { name: /Youssef El Amrani/ }).locator("visible=true").first().click();
    await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    await page.locator("h1").first().waitFor();
  }, { fullPage: true });

  await shot(page, "a10-stock-admin", () => go(page, "/fr/stock"), { fullPage: true });
  await shot(page, "a11-transfer", async () => {
    await page.getByRole("button", { name: new RegExp(`^${T.transfer} · Catégorie A`) }).first().click();
    await page.getByRole("dialog").waitFor();
  });
  await close(page);
  await shot(page, "a12-adjust", async () => {
    await page.getByRole("button", { name: new RegExp(`^${T.adjust} · Catégorie A`) }).first().click();
    await page.getByRole("dialog").waitFor();
  });
  await close(page);
  await shot(page, "a13-transfers", () => go(page, "/fr/stock/transfers"));

  await shot(page, "a14-purchases", async () => {
    await go(page, "/fr/purchases");
    // The purchases received at Maârif (test ones are received at the test stores).
    await page.getByRole("main").getByRole("searchbox").first().fill("Maârif");
  });
  await shot(page, "a15-new-purchase", async () => {
    await page.getByRole("button", { name: T.newPurchase }).click();
    await page.getByRole("dialog").waitFor();
  });
  await close(page);
  await shot(page, "a16-purchase-detail", async () => {
    await go(page, "/fr/purchases");
    await page.getByRole("main").getByRole("searchbox").first().fill("Labo Verres");
    await page.getByRole("link", { name: `${T.viewPurchase} · Labo Verres Casa` }).first().click();
    await page.getByRole("heading", { level: 1, name: T.purchaseTitle }).waitFor();
  }, { fullPage: true });
  await shot(page, "a17-supplier-payment", async () => {
    await page.getByRole("main").getByRole("button", { name: T.addPayment }).first().click();
    await page.getByRole("dialog").waitFor();
  });
  await close(page);
  await shot(page, "a18-suppliers", () => go(page, "/fr/purchases?tab=suppliers"));

  await shot(page, "a19-charges", () => go(page, `/fr/charges?period=year&location=${accounts.chargeLocations.maarif}`), { fullPage: true });
  await shot(page, "a20-new-charge", async () => {
    await page.getByRole("button", { name: T.newCharge }).click();
    await page.getByRole("dialog").waitFor();
  });
  await close(page);
  await shot(page, "a21-recurring", () => go(page, "/fr/charges?tab=recurring"));

  for (const tab of ["lists", "products", "fields", "stores", "users", "chargeLocations", "loyalty", "notifications", "roles"])
    await shot(page, `a30-settings-${tab}`, () => go(page, `/fr/settings?tab=${tab}`), { fullPage: true });

  await shot(page, "a40-notifications", () => go(page, "/fr/notifications"));
  await shot(page, "a41-user-menu", async () => {
    await go(page, "/fr/dashboard");
    await page.getByRole("button", { name: T.userMenu }).click();
  });
  await close(page);
  await page.context().close();
}

await browser.close();
console.log(failed.length ? `failed: ${failed.join(", ")}` : "all screenshots taken");
