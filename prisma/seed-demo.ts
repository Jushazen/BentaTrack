// Demo dataset: a boutique-sized catalog (5,000 products by default, the D4 catalog size) with
// about three months of sales and their inventory history, for demos and the page-load test
// (NFR-PERF-1, leaf 7.1). Every demo product code starts with "DEMO-", so the data can be
// replaced or removed without touching real records. Generation is seeded, so runs match.
//
// Run with:  npx tsx prisma/seed-demo.ts [--products=5000] [--days=90] [--remove]
// It writes to DATABASE_URL and refuses a non-local database unless --allow-remote is given.
//
// Self-contained (plain pg) so Playwright, whose loader does not resolve "@/..." or the
// generated Prisma client, can import it too (same reason as tests/e2e/fixtures/global-setup.ts).
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";

export const DEMO_CODE_PREFIX = "DEMO-";

export type DemoOptions = {
  /** Number of products. Default 5,000. */
  products?: number;
  /** Days of sales history, ending now. Default 90. */
  days?: number;
  /** Sales are credited to these users (by email); default every active user. */
  sellerEmails?: string[];
  /** Seed for the generator. Default 7. */
  seed?: number;
  now?: Date;
};

export type DemoReport = {
  products: number;
  sales: number;
  inventoryChanges: number;
  /** The demo product sold most often, with the longest history. */
  topProductId: string;
};

const CATALOG = {
  Bags: {
    items: ["Tote", "Clutch", "Sling Bag", "Backpack", "Pouch", "Shoulder Bag", "Wallet", "Basket"],
    materials: ["Abaca", "Buri", "Pandan", "Leather", "Canvas", "Woven", "Rattan", "Beaded"],
    price: [350, 4_500],
  },
  Accessories: {
    items: ["Scarf", "Hair Clip", "Bracelet", "Necklace", "Earrings", "Sunglasses", "Belt", "Ring"],
    materials: ["Silk", "Pearl", "Shell", "Gold-tone", "Silver-tone", "Capiz", "Wooden", "Floral"],
    price: [80, 1_800],
  },
  Perfumes: {
    items: ["Eau de Parfum 50 ml", "Body Mist 100 ml", "Cologne 30 ml", "Roll-on 10 ml"],
    materials: ["Sampaguita", "Vanilla", "Citrus", "Rose", "Oud", "Musk", "Ilang-ilang", "Coconut"],
    price: [150, 2_800],
  },
} as const;
const COLOURS = ["Brown", "Cream", "Black", "Tan", "Red", "Navy", "White", "Olive", "Blush"];

/** mulberry32: small, fast, seeded. Returns floats in [0, 1). */
function generator(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)];
  return { next, int, pick };
}

type DemoProduct = {
  id: string;
  name: string;
  code: string;
  barcode: string | null;
  categoryId: string;
  sellingPrice: number;
  purchasePrice: number | null;
  stockQuantity: number;
  lowStockThreshold: number;
  createdAt: Date;
};

type Row = Record<string, unknown>;

/**
 * Inserts rows in chunks with one multi-row unnest per chunk. `types` are Postgres array casts.
 * Dates go in as UTC ISO strings: node-pg would send local time with an offset, which a
 * `timestamp` (without time zone) column silently drops.
 */
async function insertRows(
  client: pg.Client,
  table: string,
  types: Record<string, string>,
  rows: Row[],
) {
  const columns = Object.keys(types);
  for (let start = 0; start < rows.length; start += 2_000) {
    const chunk = rows.slice(start, start + 2_000);
    const params = columns.map((c) =>
      chunk.map((r) => (r[c] instanceof Date ? (r[c] as Date).toISOString() : (r[c] ?? null))),
    );
    const list = columns.map((c) => `"${c}"`).join(", ");
    const unnest = columns.map((c, i) => `$${i + 1}::${types[c]}[]`).join(", ");
    await client.query(`insert into "${table}" (${list}) select * from unnest(${unnest})`, params);
  }
}

/** Deletes all demo data: demo products, their history, and any sale that includes one. */
export async function removeDemo(client: pg.Client): Promise<number> {
  const like = `${DEMO_CODE_PREFIX}%`;
  await client.query(`delete from "InventoryChange" where "productCode" like $1`, [like]);
  const demoSales = `select "saleId" from "SaleItem" where "productCode" like $1`;
  // Refunds given on demo sales during a demo; their items cascade.
  await client.query(`delete from "Refund" where "saleId" in (${demoSales})`, [like]);
  await client.query(`delete from "Sale" where id in (${demoSales})`, [like]);
  const { rowCount } = await client.query(`delete from "Product" where code like $1`, [like]);
  return rowCount ?? 0;
}

/** Replaces any earlier demo data with a fresh, reproducible dataset, in one transaction. */
export async function seedDemo(client: pg.Client, options: DemoOptions = {}): Promise<DemoReport> {
  const productCount = options.products ?? 5_000;
  const days = options.days ?? 90;
  const now = options.now ?? new Date();
  const rand = generator(options.seed ?? 7);

  await client.query("begin");
  try {
    await removeDemo(client);

    const sellers = options.sellerEmails
      ? await client.query<{ id: string }>(`select id from "User" where email = any($1)`, [
          options.sellerEmails.map((e) => e.toLowerCase()),
        ])
      : await client.query<{ id: string }>(`select id from "User" where active order by email`);
    const sellerIds = sellers.rows.map((r) => r.id);
    if (sellerIds.length === 0)
      throw new Error("No users to credit demo sales to; seed a user first");

    const categoryIds = new Map<string, string>();
    for (const name of Object.keys(CATALOG)) {
      const { rows } = await client.query<{ id: string }>(
        `insert into "Category" (id, name, "updatedAt") values ($1, $2, now())
         on conflict (name) do update set name = excluded.name returning id`,
        [randomUUID(), name],
      );
      categoryIds.set(name, rows[0].id);
    }

    const start = new Date(now.getTime() - days * 86_400_000);
    const categories = Object.keys(CATALOG) as (keyof typeof CATALOG)[];
    const products: DemoProduct[] = [];
    for (let i = 1; i <= productCount; i++) {
      const category = categories[i % categories.length];
      const spec = CATALOG[category];
      const [low, high] = spec.price;
      const pesos = Math.round(rand.int(low, high) / 5) * 5;
      const sellingPrice = pesos * 100;
      const serial = String(i).padStart(5, "0");
      products.push({
        id: randomUUID(),
        name: `${rand.pick(spec.materials)} ${spec.items[i % spec.items.length]} – ${rand.pick(COLOURS)} ${serial}`,
        code: `${DEMO_CODE_PREFIX}${serial}`,
        barcode: i % 2 === 0 ? `990${String(i).padStart(10, "0")}` : null,
        categoryId: categoryIds.get(category)!,
        sellingPrice,
        // A few staff-added products still wait for the owner to enter a cost (A7 follow-on).
        purchasePrice:
          rand.next() < 0.03 ? null : Math.round(sellingPrice * (0.5 + rand.next() * 0.2)),
        // Mostly in stock, with some low and some sold out (FR-006, FR-009).
        stockQuantity:
          rand.next() < 0.04 ? 0 : rand.next() < 0.1 ? rand.int(1, 5) : rand.int(6, 60),
        lowStockThreshold: rand.pick([5, 5, 5, 3, 10]),
        createdAt: start,
      });
    }

    // Sales: 8–30 a day in shop hours (Manila 09:00–20:00), 1–3 lines each. A few products are
    // much more popular than the rest, so best-seller lists look real.
    type Line = { product: DemoProduct; quantity: number };
    type DemoSale = { id: string; at: Date; staffId: string; lines: Line[] };
    const sales: DemoSale[] = [];
    for (let day = days; day >= 0; day--) {
      const manilaDay = new Date(now.getTime() + 8 * 3_600_000 - day * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const opening = new Date(`${manilaDay}T09:00:00+08:00`).getTime();
      const count = rand.int(8, 30);
      for (let s = 0; s < count; s++) {
        const at = new Date(opening + Math.floor(rand.next() * 11 * 3_600_000));
        if (at > now || at < start) continue;
        const lines: Line[] = [];
        const lineCount = rand.int(1, 3);
        for (let l = 0; l < lineCount; l++) {
          const product = products[Math.floor(productCount * rand.next() ** 3)];
          if (lines.some((line) => line.product === product)) continue;
          lines.push({ product, quantity: rand.next() < 0.8 ? 1 : 2 });
        }
        sales.push({ id: randomUUID(), at, staffId: rand.pick(sellerIds), lines });
      }
    }
    sales.sort((a, b) => a.at.getTime() - b.at.getTime());

    // Work back from each product's current stock so every history row's "stock after" adds up,
    // then open each product's history with the delivery that stocked it.
    const running = new Map(products.map((p) => [p.id, p.stockQuantity]));
    const saleChanges: Row[] = [];
    for (let s = sales.length - 1; s >= 0; s--) {
      const sale = sales[s];
      for (const { product, quantity } of sale.lines) {
        const after = running.get(product.id)!;
        running.set(product.id, after + quantity);
        saleChanges.push({
          id: randomUUID(),
          productId: product.id,
          productName: product.name,
          productCode: product.code,
          type: "SALE",
          quantityChange: -quantity,
          stockAfter: after,
          saleId: sale.id,
          userId: sale.staffId,
          occurredAt: sale.at,
        });
      }
    }
    const restocks: Row[] = products
      .filter((p) => running.get(p.id)! > 0)
      .map((p) => ({
        id: randomUUID(),
        productId: p.id,
        productName: p.name,
        productCode: p.code,
        type: "RESTOCK",
        quantityChange: running.get(p.id)!,
        stockAfter: running.get(p.id)!,
        saleId: null,
        userId: sellerIds[0],
        note: "Opening stock",
        occurredAt: start,
      }));

    await insertRows(
      client,
      "Product",
      {
        id: "text",
        name: "text",
        code: "text",
        barcode: "text",
        categoryId: "text",
        sellingPrice: "int",
        purchasePrice: "int",
        stockQuantity: "int",
        lowStockThreshold: "int",
        createdAt: "timestamp",
        updatedAt: "timestamp",
      },
      products.map((p) => ({ ...p, updatedAt: start })),
    );

    const saleRows: Row[] = [];
    const itemRows: Row[] = [];
    for (const sale of sales) {
      const subtotal = sale.lines.reduce((sum, l) => sum + l.product.sellingPrice * l.quantity, 0);
      // One sale in ten gets 5% or 10% off; percent discounts are stored in basis points.
      const percent = rand.next() < 0.1 ? rand.pick([500, 1_000]) : null;
      const discountAmount = percent ? Math.round((subtotal * percent) / 10_000) : 0;
      saleRows.push({
        id: sale.id,
        occurredAt: sale.at,
        recordedAt: sale.at,
        staffId: sale.staffId,
        subtotal,
        discountType: percent ? "PERCENT" : null,
        discountValue: percent,
        discountAmount,
        total: subtotal - discountAmount,
        paymentMethod: rand.next() < 0.65 ? "CASH" : "GCASH",
      });
      for (const { product, quantity } of sale.lines) {
        itemRows.push({
          id: randomUUID(),
          saleId: sale.id,
          productId: product.id,
          productName: product.name,
          productCode: product.code,
          quantity,
          unitPrice: product.sellingPrice,
          unitCost: product.purchasePrice,
        });
      }
    }
    await insertRows(
      client,
      "Sale",
      {
        id: "uuid",
        occurredAt: "timestamp",
        recordedAt: "timestamp",
        staffId: "text",
        subtotal: "int",
        discountType: '"DiscountType"',
        discountValue: "int",
        discountAmount: "int",
        total: "int",
        paymentMethod: '"PaymentMethod"',
      },
      saleRows,
    );
    await insertRows(
      client,
      "SaleItem",
      {
        id: "text",
        saleId: "uuid",
        productId: "text",
        productName: "text",
        productCode: "text",
        quantity: "int",
        unitPrice: "int",
        unitCost: "int",
      },
      itemRows,
    );
    const changes = [...restocks, ...saleChanges];
    await insertRows(
      client,
      "InventoryChange",
      {
        id: "uuid",
        productId: "text",
        productName: "text",
        productCode: "text",
        type: '"InventoryChangeType"',
        quantityChange: "int",
        stockAfter: "int",
        saleId: "uuid",
        userId: "text",
        note: "text",
        occurredAt: "timestamp",
      },
      changes,
    );
    await client.query("commit");

    const sold = new Map<string, number>();
    for (const item of itemRows) {
      const id = item.productId as string;
      sold.set(id, (sold.get(id) ?? 0) + 1);
    }
    const topProductId = [...sold.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? products[0].id;
    return {
      products: products.length,
      sales: saleRows.length,
      inventoryChanges: changes.length,
      topProductId,
    };
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}

function flag(name: string): string | undefined {
  const arg = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return arg === undefined ? undefined : (arg.split("=")[1] ?? "");
}

async function main() {
  dotenv.config({ quiet: true });
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && flag("allow-remote") === undefined) {
    throw new Error("DATABASE_URL is not a local database; pass --allow-remote to seed it anyway");
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    if (flag("remove") !== undefined) {
      const removed = await removeDemo(client);
      console.log(`Demo data removed: ${removed} products.`);
      return;
    }
    const report = await seedDemo(client, {
      products: flag("products") ? Number(flag("products")) : undefined,
      days: flag("days") ? Number(flag("days")) : undefined,
    });
    console.log(
      `Demo data ready: ${report.products} products, ${report.sales} sales, ` +
        `${report.inventoryChanges} inventory changes.`,
    );
  } finally {
    await client.end();
  }
}

// Playwright imports this file as a module; only run when started directly (tsx).
if (/seed-demo\.[cm]?[jt]s$/.test(process.argv[1] ?? "")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
