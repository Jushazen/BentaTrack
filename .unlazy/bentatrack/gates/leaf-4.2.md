# Gates: leaf 4.2 Sales history and refunds

OWNS: src/features/refunds/**, src/app/(app)/sales/**, tests/integration/refunds/**, tests/e2e/refunds/**

Scope: Sales list and full or partial refunds that restore stock, record money returned, and log REFUND history.

SRS: FR-012; amendment B3 (FR-039, FR-040), C7

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-4.2.md`

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-4.2.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: refunds restore stock, never exceed quantity sold, log REFUND, are idempotent, and staff may process them
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-039,FR-040,FR-012-REFUND,REFUND-IDEMPOTENT,REFUND-STAFF tests/integration/refunds
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G2: a partial refund works in the browser
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-039 tests/e2e/refunds
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending
