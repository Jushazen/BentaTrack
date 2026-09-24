# Gates: leaf 5.2 Owner and staff dashboards

OWNS: src/features/dashboard/**, src/app/(app)/dashboard/**, tests/integration/dashboard/**, tests/e2e/dashboard/**

Scope: Owner dashboard (totals, stock, low stock, needs-cost, recent sales, best sellers, today) and a limited staff dashboard.

SRS: §4.6 FR-023–025; amendment A6 (FR-023a), A7 follow-on

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-5.2.md`

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-5.2.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: dashboard data matches fixtures for owner and staff, including needs-cost list
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-023,FR-023A,FR-024,FR-025,NEEDS-COST-DASH tests/integration/dashboard
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G2: both dashboards render the right widgets for each role in the browser
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-023,FR-023A,FR-024,FR-025 tests/e2e/dashboard
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending
