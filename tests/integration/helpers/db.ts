// Integration-test database helpers. Always targets TEST_DATABASE_URL (see tests/integration/setup.ts).
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import type { Role } from "@/generated/prisma/client";
import { db } from "@/lib/db";

let migrated: Promise<void> | undefined;

function testUrl(): URL {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("TEST_DATABASE_URL is not set");
  const url = new URL(raw);
  if (!url.pathname.endsWith("_test")) {
    throw new Error("Refusing to use a database whose name does not end in _test");
  }
  return url;
}

async function createDatabaseIfMissing(url: URL) {
  const name = url.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query("select 1 from pg_database where datname = $1", [name]);
    if (!rowCount) await client.query(`create database "${name.replace(/"/g, '""')}"`);
  } finally {
    await client.end();
  }
}

/** Creates the test database if needed and applies migrations (once per test process). */
export function migrateTestDatabase(): Promise<void> {
  migrated ??= (async () => {
    const url = testUrl();
    await createDatabaseIfMissing(url);
    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: url.toString() },
      stdio: "pipe",
    });
  })();
  return migrated;
}

/** Empties every table. Call in beforeEach so each test starts from a clean database. */
export async function resetTestDatabase(): Promise<void> {
  await migrateTestDatabase();
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`truncate table ${list} restart identity cascade`);
}

// ---- Fixture builders -------------------------------------------------------------

export async function makeUser(role: Role = "STAFF", email?: string) {
  return db.user.create({
    data: {
      email: email ?? `${role.toLowerCase()}-${randomUUID().slice(0, 8)}@test.local`,
      name: role === "OWNER" ? "Test Owner" : "Test Staff",
      role,
      passwordHash: "not-a-real-hash",
    },
  });
}

export async function makeCategory(name = `Category ${randomUUID().slice(0, 6)}`) {
  return db.category.create({ data: { name } });
}

type ProductOverrides = Partial<{
  name: string;
  code: string;
  barcode: string | null;
  sellingPrice: number;
  purchasePrice: number | null;
  stockQuantity: number;
  lowStockThreshold: number;
}>;

export async function makeProduct(categoryId: string, overrides: ProductOverrides = {}) {
  return db.product.create({
    data: {
      name: overrides.name ?? "Test Product",
      code: overrides.code ?? `P-${randomUUID().slice(0, 8)}`,
      barcode: overrides.barcode ?? null,
      categoryId,
      sellingPrice: overrides.sellingPrice ?? 25_000,
      purchasePrice: overrides.purchasePrice === undefined ? 15_000 : overrides.purchasePrice,
      stockQuantity: overrides.stockQuantity ?? 10,
      ...(overrides.lowStockThreshold === undefined
        ? {}
        : { lowStockThreshold: overrides.lowStockThreshold }),
    },
  });
}
