import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    // The app detects the browser language on "/"; French is the product default.
    locale: "fr-FR",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/fr/login`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    // Phase 1 fake sign-in; phase 3 replaces this with seeded test users.
    env: { OPTICOR_DEV_FAKE_AUTH: "1" },
  },
});
