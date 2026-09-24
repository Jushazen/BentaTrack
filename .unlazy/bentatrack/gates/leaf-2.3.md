# Gates: leaf 2.3 User account management (owner)

OWNS: src/features/users/**, src/app/(app)/users/**, tests/integration/users/**, tests/e2e/users/**

Scope: Owner creates staff accounts, resets passwords, and deactivates/reactivates accounts; staff cannot reach any of it.

SRS: §3.1 User Accounts screen; FR-031, FR-032; amendment B6 (FR-045, FR-046)

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-2.3.md`

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-2.3.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: user actions enforce owner-only access, unique usernames, and password rules
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-045,FR-046,USERS-DUP,USERS-STAFF-DENIED tests/integration/users
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G2: owner creates, resets, deactivates, and reactivates a staff account in the browser
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-045 tests/e2e/users
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending
