// Gate oracle (leaf 7.2): the production deployment is live and secure.
// Reads PRODUCTION_URL (e.g. https://bentatrack.vercel.app) from the environment or .env and checks:
//   1. the login page loads over HTTPS
//   2. plain HTTP redirects to HTTPS
//   3. responses carry HSTS with a max-age of at least one year
//   4. /api/health reports a reachable database
// Prints DEPLOY OK only when all four pass. Prints the host, never any secret.
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const ONE_YEAR_SECONDS = 31_536_000;
const TIMEOUT_MS = 20_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const raw = process.env.PRODUCTION_URL?.trim();
if (!raw) {
  console.error(
    "PRODUCTION_URL is not set. Add the production address to .env (see docs/DEPLOY.md).",
  );
  process.exit(1);
}

let base;
try {
  base = new URL(raw);
} catch {
  console.error("PRODUCTION_URL is not a valid URL.");
  process.exit(1);
}
if (base.protocol !== "https:") {
  console.error("PRODUCTION_URL must start with https://");
  process.exit(1);
}
const host = base.host;
const failures = [];

function check(ok, label, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

async function get(url, redirect = "follow") {
  return fetch(url, { redirect, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
}

async function run(label, fn) {
  try {
    await fn();
  } catch (err) {
    check(false, label, err?.cause?.code ?? err?.name ?? "request failed");
  }
}

console.log(`Checking https://${host}`);

await run("login page over HTTPS", async () => {
  const response = await get(`https://${host}/login`);
  const body = await response.text();
  const finalUrl = new URL(response.url);
  check(
    response.status === 200 &&
      finalUrl.protocol === "https:" &&
      body.includes("Log in to BentaTrack"),
    "login page over HTTPS",
    `status ${response.status}, ${finalUrl.protocol}//${finalUrl.host}${finalUrl.pathname}`,
  );

  const hsts = response.headers.get("strict-transport-security") ?? "";
  const maxAge = Number(/max-age=(\d+)/i.exec(hsts)?.[1] ?? 0);
  check(maxAge >= ONE_YEAR_SECONDS, "HSTS header", hsts || "missing");
});

await run("HTTP redirects to HTTPS", async () => {
  const response = await get(`http://${host}/login`, "manual");
  const location = response.headers.get("location") ?? "";
  let target = null;
  try {
    target = new URL(location, `http://${host}`);
  } catch {
    // leave target null
  }
  check(
    REDIRECT_STATUSES.has(response.status) && target?.protocol === "https:" && target.host === host,
    "HTTP redirects to HTTPS",
    `status ${response.status}${location ? ` -> ${target?.protocol}//${target?.host}` : ", no Location"}`,
  );
});

await run("health endpoint", async () => {
  const response = await get(`https://${host}/api/health`);
  let body = null;
  try {
    body = await response.json();
  } catch {
    // leave body null
  }
  check(
    response.status === 200 && body?.status === "ok" && body?.database === "ok",
    "health endpoint",
    `status ${response.status}, database ${body?.database ?? "unknown"}`,
  );
});

if (failures.length) {
  console.error(`DEPLOY NOT OK: ${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("DEPLOY OK");
