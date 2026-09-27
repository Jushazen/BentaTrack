import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// End-to-end tests run a production build against the TEST database, never the dev one.
dotenv.config({ quiet: true });
const PORT = 3200;
const BASE_URL = `http://localhost:${PORT}`;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/fixtures/global-setup.ts",
  // Tests share one database, so run them one at a time.
  workers: 1,
  fullyParallel: false,
  use: { baseURL: BASE_URL },
  projects: [
    { name: "desktop", testDir: "tests/e2e", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", testDir: "tests/e2e", use: { ...devices["Pixel 7"] } },
    // Page-load timing (NFR-PERF-1) on a throttled mid-range phone; see tests/perf.
    { name: "perf", testDir: "tests/perf", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: { DATABASE_URL: testDatabaseUrl, NEXTAUTH_URL: BASE_URL },
  },
});
