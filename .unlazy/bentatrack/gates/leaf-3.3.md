# Gates: leaf 3.3 Categories and suppliers (owner)

OWNS: src/features/categories/**, src/features/suppliers/**, src/app/(app)/categories/**, src/app/(app)/suppliers/**, tests/integration/catalog/**, tests/e2e/catalog/**

Scope: Owner-only management of categories and supplier records; staff may read category names only.

SRS: FR-031, FR-032; amendments B4 (FR-041, FR-042), B5 (FR-043)

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-3.3.md`

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-3.3.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: category and supplier rules: owner CRUD, in-use category cannot be deleted, staff denied supplier access
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-041,FR-043,FR-043-INUSE,FR-042-STAFF tests/integration/catalog
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G2: owner manages categories and suppliers in the browser
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-041,FR-043 tests/e2e/catalog
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending
