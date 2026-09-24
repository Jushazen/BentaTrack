// Gate oracle: every leaf row's Owns in PLAN.md equals its ledger's OWNS: header (as sets),
// and every leaf in the PLAN tree has exactly one dispatch-table row and one ledger.
import { existsSync, readFileSync } from "node:fs";

const plan = readFileSync(".unlazy/bentatrack/PLAN.md", "utf8");
const norm = (s) =>
  new Set(
    s
      .replace(/\\\*/g, "*")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean),
  );
const failures = [];
const rows = [...plan.matchAll(/^\| (\d+\.\d+) \| (.+?) \| (.+?) \| (judgment|mechanical) \|/gm)];
const treeLeaves = [...plan.matchAll(/^\s+- (\d+\.\d+) /gm)].map((m) => m[1]);
const rowIds = rows.map((r) => r[1]);

for (const id of treeLeaves) {
  if (rowIds.filter((r) => r === id).length !== 1)
    failures.push(`leaf ${id}: expected exactly one dispatch row`);
}
for (const [, id, owns] of rows) {
  if (id === "1.1") continue; // setup leaf's ledger is GATES.md at the repo root
  const ledgerPath = `.unlazy/bentatrack/gates/leaf-${id}.md`;
  if (!existsSync(ledgerPath)) {
    failures.push(`leaf ${id}: missing ledger ${ledgerPath}`);
    continue;
  }
  const header = readFileSync(ledgerPath, "utf8").match(/^OWNS: (.+)$/m)?.[1] ?? "";
  const a = norm(owns);
  const b = norm(header);
  const onlyPlan = [...a].filter((p) => !b.has(p));
  const onlyLedger = [...b].filter((p) => !a.has(p));
  if (onlyPlan.length || onlyLedger.length) {
    failures.push(
      `leaf ${id}: PLAN-only [${onlyPlan.join(", ")}] ledger-only [${onlyLedger.join(", ")}]`,
    );
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`PLAN OWNS OK (${rows.length} leaves)`);
