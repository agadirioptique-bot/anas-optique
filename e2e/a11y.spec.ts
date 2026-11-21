import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import type { Database } from "../src/types/database";

/**
 * Accessibility and phone pass (phase 13): axe (WCAG 2.1 A/AA) on every page for both roles and on
 * the sign-in pages, failing on serious/critical issues; at 375 px no page scrolls sideways;
 * keyboard basics (skip link, visible focus, dialogs keep focus). Accounts: `npm run e2e:accounts`.
 */
const file = join(process.cwd(), "e2e/.auth/accounts.json");
type Account = { email: string; password: string };
const accounts = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { secretary: Account; admin: Account }) : null;

test.skip(!accounts || !process.env.NEXT_PUBLIC_SUPABASE_URL, "run `npm run e2e:accounts` first");
test.describe.configure({ mode: "serial", timeout: 600_000 });
const expect = baseExpect.configure({ timeout: 30_000 });

const PHONE = { width: 375, height: 812 };

async function signIn(page: Page, who: "secretary" | "admin") {
  const { email, password } = accounts![who];
  await page.goto("/fr/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(who === "admin" ? /\/fr\/dashboard$/ : /\/fr\/orders$/, { timeout: 60_000 });
}

/** One order, client and purchase to open their detail pages (read with the admin's own session). */
async function detailIds() {
  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await db.auth.signInWithPassword(accounts!.admin);
  if (error) throw error;
  const [order, client, purchase] = await Promise.all([
    db.from("order_overview").select("id").order("created_at", { ascending: false }).limit(1).single(),
    db.from("clients").select("id").limit(1).single(),
    db.from("purchases").select("id").order("created_at", { ascending: false }).limit(1).single(),
  ]);
  return { order: order.data!.id, client: client.data!.id, purchase: purchase.data!.id };
}

const SETTINGS_TABS = ["lists", "products", "fields", "stores", "users", "chargeLocations", "loyalty", "notifications", "roles"];

/** Waits for the page's own content (not the loading skeleton). */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.locator('[role="status"][aria-live="polite"]')).toHaveCount(0);
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

type Finding = { page: string; id: string; impact: string; help: string; targets: string[] };

async function audit(page: Page, label: string, findings: Finding[]) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  for (const v of result.violations) {
    if (v.impact !== "serious" && v.impact !== "critical") continue;
    findings.push({ page: label, id: v.id, impact: v.impact, help: v.help, targets: v.nodes.slice(0, 4).map((n) => n.target.join(" ")) });
  }
}

/** No sideways scroll on a phone (1 px rounding allowed). */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= width + 1) return null;
    const wide = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => el.getBoundingClientRect().right > width + 1 && getComputedStyle(el).position !== "fixed")
      .filter((el) => !el.closest("[data-scroll-x], .overflow-x-auto, .overflow-auto, .overflow-x-scroll"))
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 4).join(".")}`);
    return { scrollWidth: document.documentElement.scrollWidth, width, wide };
  });
}

const report = (findings: Finding[]) => findings.map((f) => `${f.page} · ${f.impact} ${f.id}: ${f.help}\n    ${f.targets.join("\n    ")}`).join("\n");

async function sweep(page: Page, paths: string[], who: string) {
  const findings: Finding[] = [];
  const wide: string[] = [];
  for (const path of paths) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, path);
    await audit(page, `${who} ${path}`, findings);

    await page.setViewportSize(PHONE);
    await open(page, path);
    await audit(page, `${who} ${path} (phone)`, findings);
    const o = await overflow(page);
    if (o) wide.push(`${path}: ${o.scrollWidth}px > ${o.width}px (${o.wide.join(", ")})`);
    const name = path.replace(/^\/fr\/?/, "").replace(/[/?=&]/g, "-") || "home";
    await page.screenshot({ path: `test-results/screens/phone-${who}-${name}.png`, fullPage: true, caret: "initial", animations: "disabled" });
  }
  mkdirSync("test-results", { recursive: true });
  writeFileSync(`test-results/a11y-${who}.json`, JSON.stringify({ findings, wide }, null, 2));
  expect.soft(report(findings), "axe serious/critical").toBe("");
  expect(wide.join("\n"), "horizontal scroll at 375 px").toBe("");
}

test("sign-in pages", async ({ page }) => {
  await sweep(page, ["/fr/login", "/fr/forgot-password", "/en/login"], "public");
});

test("super admin pages", async ({ page }) => {
  const ids = await detailIds();
  await signIn(page, "admin");
  await sweep(
    page,
    [
      "/fr/dashboard",
      "/fr/orders",
      "/fr/orders?view=list",
      "/fr/orders/new",
      `/fr/orders/${ids.order}`,
      "/fr/clients",
      `/fr/clients/${ids.client}`,
      "/fr/workshop",
      "/fr/stock",
      "/fr/stock/transfers",
      "/fr/purchases",
      `/fr/purchases/${ids.purchase}`,
      "/fr/charges",
      "/fr/notifications",
      ...SETTINGS_TABS.map((tab) => `/fr/settings?tab=${tab}`),
      "/fr/page-qui-nexiste-pas",
    ],
    "admin",
  );
});

test("secretary pages", async ({ page }) => {
  await signIn(page, "secretary");
  await sweep(page, ["/fr/orders", "/fr/orders/new", "/fr/clients", "/fr/stock", "/fr/notifications", "/fr/dashboard"], "secretary");
});

test("keyboard: skip link, visible focus, dialogs keep focus", async ({ page }) => {
  await signIn(page, "admin");
  await open(page, "/fr/clients");

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: /Aller au contenu/ });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);

  // Every focus stop shows an outline or ring.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    const visible = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return true;
      const s = getComputedStyle(el);
      return (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none";
    });
    expect(visible, `focus visible on stop ${i + 1}`).toBe(true);
  }

  // A dialog keeps focus inside and gives it back on Escape.
  const trigger = page.getByRole("button", { name: "Nouveau client" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
