// Builds the user guide PDF from an HTML file in scripts/guide/ and the screenshots in
// reports/guide/ (see screenshots.mjs). A4, page numbers in the footer.
//
//   node scripts/guide/build-pdf.mjs                 # French: guide.html → docs/guide_emploi.pdf
//   node scripts/guide/build-pdf.mjs en              # English: guide.en.html → docs/guide_emploi_en.pdf
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const root = process.cwd();
const english = process.argv[2] === "en";
const source = english ? "guide.en.html" : "guide.html";
const work = join(root, "reports/guide");
mkdirSync(work, { recursive: true });
copyFileSync(join(root, "scripts/guide", source), join(work, source));

const html = readFileSync(join(work, source), "utf8");
const missing = [...html.matchAll(/src="(shots[^/"]*\/[^"]+)"/g)].map((m) => m[1]).filter((src) => !existsSync(join(work, src)));
if (missing.length) {
  console.error(`missing screenshots:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(join(work, source)).href, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const out = join(root, english ? "docs/guide_emploi_en.pdf" : "docs/guide_emploi.pdf");
await page.pdf({
  path: out,
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#5b6b77;padding:0 16mm;display:flex;justify-content:space-between;font-family:Helvetica,Arial,sans-serif">
    <span>OPTICOR · ${english ? "User guide" : "Guide d'emploi"}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
});
await browser.close();
console.log(`written ${out}`);
