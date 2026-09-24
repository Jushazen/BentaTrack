# Gates: leaf 3.2 Products

OWNS: src/features/products/**, src/app/(app)/products/**, src/lib/storage.ts, tests/integration/products/**, tests/e2e/products/**

Scope: Product list, add, edit (logged), owner-only delete of discontinued products, image upload (Vercel Blob, local disk in dev), automatic status labels, and cost/supplier hidden from staff.

SRS: §4.2 FR-001–006; FR-009, FR-037; amendments A2, A3, A7 follow-on, B4 (FR-042)

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-3.2.md`

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-3.2.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: product actions: create/edit/delete rules, staff cannot delete or see cost/supplier, edits logged, staff-created products flagged as needing cost, images stored
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-001,FR-002,FR-003,FR-004,FR-004-STAFF,FR-042,EDIT-LOG,NEEDS-COST,IMG-1 tests/integration/products
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G2: in the browser: add with image, edit, delete, Out of Stock label, Low Stock shown separately
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-001,FR-003,FR-004,FR-006,FR-009 tests/e2e/products
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending
