# Gates: leaf 5.1 Sales reports

OWNS: src/features/reports/**, src/lib/dates.ts, src/app/(app)/reports/**, src/components/charts/**, tests/unit/reports/**, tests/integration/reports/**, tests/e2e/reports/**

Scope: Daily/weekly/monthly/yearly sales in Asia/Manila with Monday weeks, refunds subtracted on their own date, best sellers, owner-only gross profit, Chart.js charts; staff denied.

SRS: §4.6 FR-021, FR-022; amendment B7 (FR-047, FR-048)

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-5.1.md`

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-5.1.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: report totals equal independently computed fixture totals across Manila day/week/month/year boundaries; best sellers, profit, and staff denial correct
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-021,FR-021-TZ,FR-022,FR-047,FR-047-NOCOST,REPORTS-STAFF tests/unit/reports tests/integration/reports
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G2: reports and charts render for the owner in the browser
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-021,FR-022 tests/e2e/reports
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending
