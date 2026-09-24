// Integration tests talk to a real Postgres database, never the dev database.
import "dotenv/config";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
