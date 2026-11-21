import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import type { Database } from "../src/types/database";

/**
 * A super admin moves a signed-in secretary to another store: her sessions are revoked and the
 * database denies her old token, so her next page must send her to sign in again ("session
 * expired") instead of showing empty pages. Uses its own "mover" secretary so the other specs keep
 * their session. Accounts come from `npm run e2e:accounts`.
 */
const file = join(process.cwd(), "e2e/.auth/accounts.json");
const accounts = existsSync(file)
  ? (JSON.parse(readFileSync(file, "utf8")) as {
      admin: { email: string; password: string };
      mover?: { email: string; password: string };
      storePrefix: string;
    })
  : null;

test.skip(!accounts?.mover || !process.env.NEXT_PUBLIC_SUPABASE_URL, "run `npm run e2e:accounts` first");
// A dev server (next dev) can take several seconds per page on a busy machine.
test.describe.configure({ timeout: 180_000 });
const expect = baseExpect.configure({ timeout: 30_000 });

async function adminDb() {
  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await db.auth.signInWithPassword(accounts!.admin);
  if (error) throw error;
  return db;
}

async function signInSecretary(page: Page) {
  await page.goto("/fr/login");
  await page.locator("#email").fill(accounts!.mover!.email);
  await page.locator("#password").fill(accounts!.mover!.password);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(/\/fr\/orders$/, { timeout: 60_000 });
}

test("a store change signs the secretary out instead of showing empty pages", async ({ page }) => {
  const db = await adminDb();
  const { data: stores } = await db.from("stores").select("id, prefix").in("prefix", [accounts!.storePrefix, "TSB"]);
  const home = stores!.find((s) => s.prefix === accounts!.storePrefix)!.id;
  const other = stores!.find((s) => s.prefix === "TSB")!.id;
  const { data: secretary } = await db.from("profiles").select("id").eq("email", accounts!.mover!.email).single();
  const move = (storeId: string) =>
    db.rpc("admin_update_user_access", { p_user_id: secretary!.id, p_role: "secretary", p_store_id: storeId, p_is_active: true });

  await signInSecretary(page);
  try {
    expect((await move(other)).error).toBeNull();
    await page.goto("/fr/stock");
    await expect(page).toHaveURL(/\/fr\/login\?error=sessionExpired$/);
    await expect(page.getByText("Votre session a expiré")).toBeVisible();

    // Signing in again gives a token for the new store: its stock page is not empty.
    await signInSecretary(page);
    await page.goto("/fr/stock");
    await expect(page.getByText("Test Succursale B").first()).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
  } finally {
    await move(home);
  }
});
