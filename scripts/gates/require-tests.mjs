// Gate oracle: every listed requirement ID is covered by at least one PASSING test,
// and no test in the run failed.
//
// Tests are tagged by putting the ID in square brackets in the test title, e.g.
//   test("[FR-005] a sale reduces stock by the quantity sold", ...)
//
// Usage:
//   node scripts/gates/require-tests.mjs vitest --ids FR-005,FR-006 [vitest filters...]
//   node scripts/gates/require-tests.mjs playwright --ids FR-008 [playwright filters...]
//
// Prints "REQUIRED TESTS PASSED" only after every assertion passes.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [runner, ...rest] = process.argv.slice(2);
const idsFlag = rest.indexOf("--ids");
if (!["vitest", "playwright"].includes(runner) || idsFlag < 0 || !rest[idsFlag + 1]) {
  console.error("usage: require-tests.mjs <vitest|playwright> --ids ID1,ID2 [filters...]");
  process.exit(2);
}
const ids = rest[idsFlag + 1]
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const filters = rest.filter((_, i) => i !== idsFlag && i !== idsFlag + 1);

const dir = mkdtempSync(join(tmpdir(), "require-tests-"));
const out = join(dir, "report.json");
let run;
if (runner === "vitest") {
  run = spawnSync(
    ["npx vitest run", ...filters, "--reporter=json", `--outputFile="${out}"`].join(" "),
    {
      shell: true,
      encoding: "utf8",
    },
  );
} else {
  run = spawnSync(["npx playwright test", ...filters, "--reporter=json"].join(" "), {
    shell: true,
    encoding: "utf8",
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: out },
  });
}

/** @type {{ title: string, status: "passed" | "failed" | "skipped" }[]} */
const results = [];
try {
  const report = JSON.parse(readFileSync(out, "utf8"));
  if (runner === "vitest") {
    for (const file of report.testResults ?? []) {
      for (const t of file.assertionResults ?? []) {
        const status =
          t.status === "passed" ? "passed" : t.status === "failed" ? "failed" : "skipped";
        results.push({ title: t.fullName ?? t.title, status });
      }
    }
  } else {
    const walk = (suite, prefix) => {
      for (const spec of suite.specs ?? []) {
        for (const t of spec.tests ?? []) {
          const statuses = (t.results ?? []).map((r) => r.status);
          const last = statuses.at(-1);
          const status =
            last === "passed" ? "passed" : last === "skipped" || !last ? "skipped" : "failed";
          results.push({ title: `${prefix} ${spec.title} (${t.projectName})`.trim(), status });
        }
      }
      for (const child of suite.suites ?? []) walk(child, `${prefix} ${child.title}`.trim());
    };
    for (const suite of report.suites ?? []) walk(suite, suite.title);
  }
} catch (err) {
  console.error(`could not read ${runner} JSON report: ${err.message}`);
  console.error((run.stdout ?? "").slice(-3000), (run.stderr ?? "").slice(-3000));
  process.exit(1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const failures = [];
const failed = results.filter((r) => r.status === "failed");
for (const r of failed) failures.push(`FAILED: ${r.title}`);
if (run.status !== 0 && failed.length === 0)
  failures.push(`${runner} exited with code ${run.status}`);

for (const id of ids) {
  const tagged = results.filter((r) => r.title.includes(`[${id}]`));
  if (tagged.length === 0) failures.push(`MISSING: no test tagged [${id}]`);
  else if (!tagged.some((r) => r.status === "passed"))
    failures.push(`NOT PASSED: [${id}] (all skipped)`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`REQUIRED TESTS PASSED (${ids.length} ids, ${results.length} tests)`);
