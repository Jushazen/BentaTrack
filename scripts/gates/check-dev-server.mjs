// Gate oracle: `next dev` starts and serves the home page with HTTP 200.
// Prints DEV SERVER OK only after every assertion passes; always stops the server.
import { spawn, spawnSync } from "node:child_process";

const port = Number(process.env.GATE_PORT ?? 3100);
const url = `http://localhost:${port}/`;
const deadline = Date.now() + 120_000;

const server = spawn(`npx next dev -p ${port}`, {
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));

function stop() {
  if (server.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    server.kill("SIGTERM");
  }
}

async function main() {
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(`dev server exited early (code ${server.exitCode})`);
    try {
      const res = await fetch(url);
      const html = await res.text();
      if (res.status !== 200) throw new Error(`expected HTTP 200, got ${res.status}`);
      if (!html.includes("BentaTrack")) throw new Error("home page did not contain 'BentaTrack'");
      if (/Unhandled Runtime Error|Build Error/.test(html))
        throw new Error("error overlay in page");
      return;
    } catch (err) {
      if (err instanceof Error && /expected|contain|overlay/.test(err.message)) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("dev server did not respond within 120s");
}

try {
  await main();
  if (/\berror\b/i.test(log.replace(/0 errors?/gi, ""))) {
    throw new Error("dev server log contains an error:\n" + log.slice(-2000));
  }
  stop();
  console.log(`DEV SERVER OK ${url}`);
} catch (err) {
  stop();
  console.error(String(err instanceof Error ? err.message : err));
  console.error(log.slice(-2000));
  process.exit(1);
}
