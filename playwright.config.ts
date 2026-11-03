import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Supabase keys + E2E_* test accounts (dev project). Next loads .env.local itself for the server.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const PORT = 3100;
// Next 16 allows one `next dev` per folder: point E2E_BASE_URL at an already running one (e.g. http://localhost:3000).
const EXTERNAL_URL = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: EXTERNAL_URL ?? `http://localhost:${PORT}`,
    trace: "on-first-retry",
    // The app detects the browser language on "/"; French is the product default.
    locale: "fr-FR",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: EXTERNAL_URL
    ? undefined
    : {
        command: `npx next dev -p ${PORT}`,
        url: `http://localhost:${PORT}/fr/login`,
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
      },
});
