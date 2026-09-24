import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a production build. Browsers are installed in the testing leaf
// (`npx playwright install chromium`).
export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://localhost:3200" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run build && npx next start -p 3200",
    url: "http://localhost:3200",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
