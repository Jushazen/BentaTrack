# Gates: leaf 2.1 Data model, migrations, seed, data helpers

OWNS: prisma/schema.prisma, prisma/migrations/**, prisma/seed.ts, src/lib/db.ts, src/lib/money.ts, src/lib/stock-status.ts, src/lib/inventory-log.ts, src/lib/commands.ts, src/lib/result.ts, tests/integration/helpers/**, tests/integration/data/**, tests/unit/data/**, package.json

Scope: The nine-table Prisma schema from the PLAN contract, its first migration, an idempotent seed, and the shared data helpers every feature uses.

SRS: §6.1; amendments A2–A5, B1, C1–C7; FR-002, FR-004, FR-006, FR-009, FR-010, FR-011, FR-037

Notes:
- Start Docker Desktop, then `npm run db:up`.
- Add `"postinstall": "prisma generate"` to package.json so fresh clones get the client.
- Integration test helper must create/reset the `bentatrack_test` database (e.g. `prisma migrate reset --force` with DATABASE_URL=TEST_DATABASE_URL).

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-2.1.md`

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-2.1.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: local Postgres accepts connections
  CHECK: node scripts/gates/check-db.mjs
  EXPECT: DB OK
  EVIDENCE: pending

- [ ] G2: schema contains every agreed model, field, enum value, and unique constraint
  CHECK: node scripts/gates/check-schema.mjs
  EXPECT: SCHEMA OK
  EVIDENCE: pending

- [ ] G3: migrations apply cleanly and match the schema
  CHECK: npx prisma migrate deploy && npx prisma migrate status
  EXPECT: Database schema is up to date
  EVIDENCE: pending

- [ ] G4: fresh clones generate the Prisma client on install
  CHECK: npm pkg get scripts.postinstall
  EXPECT: prisma generate
  EVIDENCE: pending

- [ ] G5: seed creates the owner and starter categories and is safe to re-run
  CHECK: node scripts/gates/require-tests.mjs vitest --ids SEED-1,SEED-2 tests/integration/data
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G6: data rules hold: fields and uniqueness, stock status, snapshots survive deletion, history logging, money, idempotent commands
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-002,FR-004,FR-006,FR-009,FR-010,FR-011,FR-037,MONEY-1,CMD-1 tests/unit/data tests/integration/data
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending
