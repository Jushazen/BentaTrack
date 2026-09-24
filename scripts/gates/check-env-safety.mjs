// Gate oracle: secrets stay out of git.
// - .env.example lists every required variable, and its values are placeholders only.
// - git ignores .env (positive control) but tracks .env.example.
// Never prints any value from .env.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const REQUIRED = [
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
  "POSTGRES_PORT",
  "DATABASE_URL",
  "TEST_DATABASE_URL",
  "AUTH_SECRET",
  "BLOB_READ_WRITE_TOKEN",
  "SEED_OWNER_USERNAME",
  "SEED_OWNER_PASSWORD",
];
const SECRET_KEYS = [
  "POSTGRES_PASSWORD",
  "AUTH_SECRET",
  "BLOB_READ_WRITE_TOKEN",
  "SEED_OWNER_PASSWORD",
];
const PLACEHOLDER = /^(|change-me.*|replace-with-.*)$/;

const failures = [];
const example = Object.fromEntries(
  readFileSync(".env.example", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
for (const key of REQUIRED) if (!(key in example)) failures.push(`.env.example missing ${key}`);
for (const key of SECRET_KEYS) {
  if (key in example && !PLACEHOLDER.test(example[key]))
    failures.push(`.env.example ${key} is not a placeholder`);
}

function ignored(path) {
  const r = spawnSync("git", ["check-ignore", "-q", "--no-index", path]);
  if (r.error) throw r.error;
  return r.status === 0;
}
if (!ignored(".env")) failures.push(".env is NOT ignored by git");
if (!ignored(".env.local")) failures.push(".env.local is NOT ignored by git");
if (ignored(".env.example")) failures.push(".env.example is ignored but must be committed");

const tracked = spawnSync("git", ["ls-files", "--", ".env", ".env.local"], { encoding: "utf8" });
if (tracked.stdout.trim())
  failures.push("a real env file is tracked by git: " + tracked.stdout.trim());

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ENV SAFETY OK");
