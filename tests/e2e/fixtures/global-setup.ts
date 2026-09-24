// Runs once before the e2e suite: migrates and empties the TEST database, then creates the
// fixture accounts. Self-contained (plain pg + bcryptjs) because Playwright's loader does not
// resolve the "@/..." path alias used by the app and the integration-test helpers.
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import pg from "pg";
import { E2E_PASSWORD, E2E_USERS } from "./users";

async function ensureDatabase(url: URL) {
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const name = url.pathname.slice(1);
    const { rowCount } = await client.query("select 1 from pg_database where datname = $1", [name]);
    if (!rowCount) await client.query(`create database "${name.replace(/"/g, '""')}"`);
  } finally {
    await client.end();
  }
}

export default async function globalSetup() {
  dotenv.config({ quiet: true });
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("TEST_DATABASE_URL is not set");
  const url = new URL(raw);
  if (!url.pathname.endsWith("_test")) {
    throw new Error("Refusing to use a database whose name does not end in _test");
  }

  await ensureDatabase(url);
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: "pipe",
  });

  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'",
    );
    const tables = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
    if (tables) await client.query(`truncate table ${tables} restart identity cascade`);

    const passwordHash = await bcrypt.hash(E2E_PASSWORD, 12);
    for (const user of Object.values(E2E_USERS)) {
      await client.query(
        `insert into "User" (id, email, name, "passwordHash", role, active, "updatedAt")
         values ($1, $2, $3, $4, $5, $6, now())`,
        [randomUUID(), user.email, user.name, passwordHash, user.role, user.active],
      );
    }
    await client.query(
      `insert into "Category" (id, name, "updatedAt") values ($1, 'E2E Category', now())`,
      [randomUUID()],
    );
  } finally {
    await client.end();
  }
}
