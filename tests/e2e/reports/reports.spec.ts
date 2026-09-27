import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import dotenv from "dotenv";
import pg from "pg";
import { E2E_USERS, logInAs } from "../fixtures/users";

async function withTestDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  dotenv.config({ quiet: true });
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

type Line = { name: string; code: string; price: number; cost: number | null; quantity: number };

/**
 * Puts one week of history straight into the TEST database, in a past week of its own for each
 * browser project so the two runs don't see each other's sales. Times are UTC; Manila is UTC+8.
 */
function insertWeek(monday: string, suffix: string) {
  const at = (day: number, manilaHour: number) => {
    const date = new Date(`${monday}T00:00:00+08:00`);
    date.setUTCDate(date.getUTCDate() + day);
    date.setUTCHours(date.getUTCHours() + manilaHour);
    return date;
  };
  const tote = {
    name: `Report Tote ${suffix}`,
    code: `E2E-RPT-T-${suffix}`,
    price: 50_000,
    cost: 30_000,
  };
  const fan = {
    name: `Report Fan ${suffix}`,
    code: `E2E-RPT-F-${suffix}`,
    price: 25_000,
    cost: null,
  };

  return withTestDb(async (client) => {
    const ids = new Map<string, string>();
    for (const product of [tote, fan]) {
      const id = randomUUID();
      ids.set(product.code, id);
      await client.query(
        `insert into "Product" (id, name, code, "categoryId", "sellingPrice", "purchasePrice", "stockQuantity", "updatedAt")
         select $1, $2, $3, id, $4, $5, 10, now() from "Category" where name = 'E2E Category'`,
        [id, product.name, product.code, product.price, product.cost],
      );
    }

    const sale = async (when: Date, method: "CASH" | "GCASH", lines: Line[]) => {
      const saleId = randomUUID();
      const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
      await client.query(
        `insert into "Sale" (id, "occurredAt", "staffId", subtotal, total, "paymentMethod")
         select $1, $2, id, $3, $3, $4 from "User" where email = $5`,
        [saleId, when, total, method, E2E_USERS.staff.email],
      );
      const itemIds: string[] = [];
      for (const line of lines) {
        const itemId = randomUUID();
        itemIds.push(itemId);
        await client.query(
          `insert into "SaleItem" (id, "saleId", "productId", "productName", "productCode", quantity, "unitPrice", "unitCost")
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            itemId,
            saleId,
            ids.get(line.code),
            line.name,
            line.code,
            line.quantity,
            line.price,
            line.cost,
          ],
        );
      }
      return { saleId, itemIds };
    };

    // Monday 00:30: 3 totes, cash (₱1,500). Wednesday: 1 fan, GCash (₱250).
    const first = await sale(at(0, 0.5), "CASH", [{ ...tote, quantity: 3 }]);
    await sale(at(2, 14), "GCASH", [{ ...fan, quantity: 1 }]);
    // Thursday: one tote comes back (₱500).
    const refundId = randomUUID();
    await client.query(
      `insert into "Refund" (id, "saleId", "occurredAt", "userId", amount)
       select $1, $2, $3, id, 50000 from "User" where email = $4`,
      [refundId, first.saleId, at(3, 11), E2E_USERS.staff.email],
    );
    await client.query(
      `insert into "RefundItem" (id, "refundId", "saleItemId", quantity, amount)
       values ($1, $2, $3, 1, 50000)`,
      [randomUUID(), refundId, first.itemIds[0]],
    );
    await client.query(`update "SaleItem" set "refundedQuantity" = 1 where id = $1`, [
      first.itemIds[0],
    ]);
    return { tote, fan };
  });
}

function stat(page: Page, label: string) {
  return page
    .locator("dl[aria-label=Totals] dt")
    .getByText(label, { exact: true })
    .locator("xpath=..");
}

const WEEKS = {
  desktop: {
    monday: "2024-03-04",
    title: "4–10 March 2024",
    next: "11–17 March 2024",
    days: ["Mon 4", "Wed 6", "Thu 7"],
  },
  phone: {
    monday: "2024-06-03",
    title: "3–9 June 2024",
    next: "10–16 June 2024",
    days: ["Mon 3", "Wed 5", "Thu 6"],
  },
} as const;

test("[FR-021] the owner reads a weekly report with refunds on the day they were given", async ({
  page,
}, info) => {
  const week = WEEKS[info.project.name as keyof typeof WEEKS];
  await insertWeek(week.monday, `${info.project.name}-${Date.now()}`);

  await logInAs(page, "owner");
  await page.goto(`/reports?period=week&date=${week.monday}`);
  await expect(page.getByRole("heading", { name: "Sales reports" })).toBeVisible();
  await expect(page.getByRole("heading", { name: week.title })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Report period" }).getByRole("link", { name: "Weekly" }),
  ).toHaveAttribute("aria-current", "page");

  await expect(stat(page, "Net sales")).toContainText("₱1,250.00");
  await expect(stat(page, "Sales")).toContainText("₱1,750.00");
  await expect(stat(page, "Sales")).toContainText("2 sales");
  await expect(stat(page, "Refunds")).toContainText("₱500.00");
  await expect(stat(page, "Cash (net)")).toContainText("₱1,000.00");
  await expect(stat(page, "GCash (net)")).toContainText("₱250.00");
  // Tote: ₱1,000 paid for the two kept less 2 × ₱300 cost. The fan has no cost and is left out.
  await expect(stat(page, "Gross profit")).toContainText("₱400.00");
  await expect(stat(page, "Gross profit")).toContainText(
    "1 item without a purchase price not counted",
  );

  // The chart draws, and its table view has the same figures per day.
  const chart = page.getByRole("img", { name: /Net sales by day: ₱1,250\.00 in total/ });
  await expect(chart).toBeVisible();
  const box = await chart.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
  await page.getByText("Show as table").click();
  const table = page.getByRole("table", { name: "Net sales by day" });
  const [mon, wed, thu] = week.days;
  await expect(table.getByRole("row", { name: mon })).toContainText("₱1,500.00");
  await expect(table.getByRole("row", { name: wed })).toContainText("₱250.00");
  await expect(table.getByRole("row", { name: thu })).toContainText("-₱500.00");

  // Moving on a week shows an empty report.
  await page.getByRole("link", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: week.next })).toBeVisible();
  await expect(stat(page, "Net sales")).toContainText("₱0.00");
  await expect(page.getByText("Nothing sold in this period.")).toBeVisible();
});

test("[FR-022] best sellers list the week's products by units kept", async ({ page }, info) => {
  const week = WEEKS[info.project.name as keyof typeof WEEKS];
  // A week of its own, eight weeks after the one above, so the two tests don't mix.
  const monday = new Date(`${week.monday}T12:00:00+08:00`);
  monday.setUTCDate(monday.getUTCDate() + 7 * 8);
  const date = monday.toISOString().slice(0, 10);
  const { tote, fan } = await insertWeek(date, `${info.project.name}-bs-${Date.now()}`);

  await logInAs(page, "owner");
  await page.goto(`/reports?period=week&date=${date}`);
  const list = page.getByRole("list", { name: "Best sellers" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  // 3 totes sold, 1 returned: 2 kept, ₱1,000. Then the fan: 1 sold, ₱250.
  await expect(list.getByRole("listitem").nth(0)).toContainText(tote.name);
  await expect(list.getByRole("listitem").nth(0)).toContainText("2 sold");
  await expect(list.getByRole("listitem").nth(0)).toContainText("₱1,000.00");
  await expect(list.getByRole("listitem").nth(1)).toContainText(fan.name);
  await expect(list.getByRole("listitem").nth(1)).toContainText("1 sold");

  // Switching to the monthly view keeps the date and still lists them.
  await page
    .getByRole("navigation", { name: "Report period" })
    .getByRole("link", { name: "Monthly" })
    .click();
  await expect(page).toHaveURL(/period=month/);
  await expect(page.getByRole("img", { name: /Net sales by day/ })).toBeVisible();
  await expect(list.getByRole("listitem").first()).toContainText(tote.name);
});

test("[REPORTS-STAFF] staff can't open sales reports", async ({ page }) => {
  await logInAs(page, "staff");
  await page.goto("/reports");
  await expect(page).not.toHaveURL(/\/reports/);
  await expect(page.getByRole("heading", { name: "Sales reports" })).toHaveCount(0);
});
