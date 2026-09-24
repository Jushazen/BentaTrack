# Gates: leaf 3.4 Restock and inventory history

OWNS: src/features/inventory/**, src/app/(app)/inventory-history/**, tests/integration/inventory/**, tests/e2e/inventory/**

Scope: Restock action (online path) and an inventory history page filterable by product, newest first.

SRS: §4.4 FR-010–012; amendment B2 (FR-038)

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-3.4.md`

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-3.4.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: restock increases stock by the received quantity, rejects invalid quantities, and logs date, product, user, delta, stock-after
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-038,FR-038-INVALID,FR-010,FR-011,FR-012-RESTOCK tests/integration/inventory
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G2: restock and history view work in the browser
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-038,FR-012-VIEW tests/e2e/inventory
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending
