import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// DB integration tests against the DEV Supabase project (keys from .env.local, never printed).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // `server-only` throws outside a React server build; the admin client is safe to use in Node tests.
    alias: { "server-only": fileURLToPath(new URL("./tests/db/server-only.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
