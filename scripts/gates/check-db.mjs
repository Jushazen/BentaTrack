// Gate oracle: the local Postgres from docker-compose accepts connections.
// Never prints the connection string.
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (copy .env.example to .env)");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  const { rows } = await client.query("select 1 as ok");
  if (rows[0]?.ok !== 1) throw new Error("unexpected query result");
  console.log("DB OK");
} catch (err) {
  console.error("database not reachable: " + (err?.code ?? (err?.message || String(err))));
  console.error("Is Docker Desktop running? Try: npm run db:up");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
