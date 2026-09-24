# Gates: leaf 7.1 End-to-end flows and performance

OWNS: tests/e2e/flows/**, tests/perf/**, prisma/seed-demo.ts, scripts/gates/perf/**

Scope: The SRS system flow end to end, full history coverage, per-user attribution, and the 2-second page-load target on a production build.

SRS: §2.1 system flow; FR-012; §5.1, §5.2; amendment D4

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-7.1.md`

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-7.1.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: login, scan, sell, stock deducted, dashboard and reports updated; history shows every change type; every change is attributed to its user
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FLOW-SYSTEM,FR-012,NFR-SEC-2 tests/e2e/flows
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G2: dashboard and product pages load under 2 s on a throttled phone profile with the demo dataset
  CHECK: node scripts/gates/require-tests.mjs playwright --ids NFR-PERF-1 tests/perf
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G3: on a real phone, offline use feels as fast as online use (§5.1 bullet 4)
  EVIDENCE: pending
