// Captures the leaf-3.1 review screenshots (G2) from a running production server on :3300.
import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3300";
const OUT = "docs/design/3.1";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const shots = [];

async function session(name, device, scheme) {
  const context = await browser.newContext({ ...device, colorScheme: scheme });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.screenshot({ path: `${OUT}/${name}-login.png` });
  shots.push(`${name}-login.png`);
  await page.getByLabel("Email").fill("owner@e2e.test");
  await page.getByLabel("Password").fill("e2e-Password-1");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/dashboard$/);
  await page.getByText(/low on stock or out of stock/).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}-dashboard.png` });
  shots.push(`${name}-dashboard.png`);
  if (device.isMobile) {
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("dialog", { name: "More pages" }).waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${name}-more-sheet.png` });
    shots.push(`${name}-more-sheet.png`);
  }
  await context.close();
}

await session("desktop-light", devices["Desktop Chrome"], "light");
await session("desktop-dark", devices["Desktop Chrome"], "dark");
await session("phone-light", devices["Pixel 7"], "light");
await session("phone-dark", devices["Pixel 7"], "dark");
await browser.close();
console.log("saved:\n" + shots.map((s) => `${OUT}/${s}`).join("\n"));
