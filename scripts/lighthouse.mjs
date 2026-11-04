// Lighthouse on Orders and Dashboard as the E2E super admin (phase 13).
//
//   npm run build && npx next start -p 3200      # production build; the dev server can stay on :3000
//   npm run lighthouse                           # LH_BASE_URL=http://localhost:3200 by default
//
// Signs in with Playwright in a persistent Chromium (so Lighthouse's tab shares the session cookie),
// then runs Lighthouse (mobile + desktop) without resetting storage. Reports: reports/lighthouse/.
// Accounts come from `npm run e2e:accounts`; no secret is read from .env files here.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";

const BASE = process.env.LH_BASE_URL ?? "http://localhost:3200";
const PAGES = ["/fr/orders", "/fr/dashboard"];
const PORT = 9333;
const OUT = join(process.cwd(), "reports/lighthouse");

const { admin } = JSON.parse(readFileSync(join(process.cwd(), "e2e/.auth/accounts.json"), "utf8"));
const profile = mkdtempSync(join(tmpdir(), "opticor-lh-"));
const browser = await chromium.launchPersistentContext(profile, { args: [`--remote-debugging-port=${PORT}`], viewport: { width: 1280, height: 900 } });

try {
  const page = browser.pages()[0] ?? (await browser.newPage());
  await page.goto(`${BASE}/fr/login`);
  await page.locator("#email").fill(admin.email);
  await page.locator("#password").fill(admin.password);
  await page.locator("form").getByRole("button").click();
  await page.waitForURL(/\/fr\/dashboard$/, { timeout: 90_000 });
  // Warm both pages once so the first audit doesn't measure a cold server.
  for (const path of PAGES) await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });

  mkdirSync(OUT, { recursive: true });
  const summary = [];
  for (const path of PAGES) {
    for (const formFactor of ["mobile", "desktop"]) {
      const flags = { port: PORT, output: "html", logLevel: "error", disableStorageReset: true };
      const result = await lighthouse(`${BASE}${path}`, flags, formFactor === "desktop" ? desktopConfig : undefined);
      if (!result) throw new Error(`no result for ${path}`);
      const name = `${path.split("/").pop()}-${formFactor}`;
      writeFileSync(join(OUT, `${name}.html`), result.report);
      const c = result.lhr.categories;
      const score = (k) => Math.round((c[k]?.score ?? 0) * 100);
      const row = {
        page: path,
        formFactor,
        performance: score("performance"),
        accessibility: score("accessibility"),
        bestPractices: score("best-practices"),
        seo: score("seo"),
        lcp: result.lhr.audits["largest-contentful-paint"]?.displayValue,
        tbt: result.lhr.audits["total-blocking-time"]?.displayValue,
        cls: result.lhr.audits["cumulative-layout-shift"]?.displayValue,
        finalUrl: result.lhr.finalDisplayedUrl,
      };
      summary.push(row);
      console.log(JSON.stringify(row));
    }
  }
  writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}
