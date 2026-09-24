# Gates: leaf 2.1 Data model, migrations, seed, data helpers

OWNS: prisma/schema.prisma, prisma/migrations/**, prisma/seed.ts, src/lib/db.ts, src/lib/money.ts, src/lib/stock-status.ts, src/lib/inventory-log.ts, src/lib/commands.ts, src/lib/result.ts, tests/integration/helpers/**, tests/integration/data/**, tests/unit/data/**, package.json

Scope: The nine-table Prisma schema from the PLAN contract, its first migration, an idempotent seed, and the shared data helpers every feature uses.

SRS: §6.1; amendments A2–A5, B1, C1–C7; FR-002, FR-004, FR-006, FR-009, FR-010, FR-011, FR-037

Notes:
- Start Docker Desktop, then `npm run db:up`.
- Add `"postinstall": "prisma generate"` to package.json so fresh clones get the client.
- Integration test helper must create/reset the `bentatrack_test` database (e.g. `prisma migrate reset --force` with DATABASE_URL=TEST_DATABASE_URL).

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-2.1.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-2.1.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=6cc5b516d478422662f475a3f0961683ea60b78722abeb4a9b1d377e0158e219; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries

- [x] G1: local Postgres accepts connections
  CHECK: node scripts/gates/check-db.mjs
  EXPECT: DB OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=eea7570386b09e1526cc1384d6270c060dcfea46d4ac53135818ad4281b13242; exit=0; EXPECT=matched; output-sha256=49a6d72a1c953bef462dfbfc997f1014584746a04b419819475d2e75d4263c6d; output-bytes=6; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries

- [x] G2: schema contains every agreed model, field, enum value, and unique constraint
  CHECK: node scripts/gates/check-schema.mjs
  EXPECT: SCHEMA OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=7bad42e1c145a8a1353510cf048378c0412af39967f3a63fd7086fd5167e27b0; exit=0; EXPECT=matched; output-sha256=0ace77e0aca86206682bd5e15281f9587d721ef285898b9e4e4a7377d206c36a; output-bytes=30; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries

- [x] G3: migrations apply cleanly and match the schema
  CHECK: npx prisma migrate deploy && npx prisma migrate status
  EXPECT: Database schema is up to date
  EVIDENCE: automatic-evidence=v1; definition-sha256=2fb3acb07c0deac543d894a6e588dc0981a00696f533f620ca8b9775cd19ee62; exit=0; EXPECT=matched; output-sha256=40ce0d09e3e158b364201fed3657fa84ddf683b249ee8a89d8397770090a2946; output-bytes=571; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries

- [x] G4: fresh clones generate the Prisma client on install
  CHECK: npm pkg get scripts.postinstall
  EXPECT: prisma generate
  EVIDENCE: automatic-evidence=v1; definition-sha256=2845f7c1e8094509479988b222ba8748ce3ce8c5ed63841a7bfce4c6e178c89f; exit=0; EXPECT=matched; output-sha256=5b5c15805c54e6cad5e0cd297ab4dfec757387d8e451d6b41a134e4258e5b4e0; output-bytes=18; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries

- [x] G5: seed creates the owner and starter categories and is safe to re-run
  CHECK: node scripts/gates/require-tests.mjs vitest --ids SEED-1,SEED-2 tests/integration/data
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=09170e2ea77501631390e7d48e02014f10f1a37b6e95dc8af1da623e2a5916f4; exit=0; EXPECT=matched; output-sha256=3b39819ceb8f284a19bb978c97eb9700c9d4896cde839e1dfcdf1101de531e03; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries

- [x] G6: data rules hold: fields and uniqueness, stock status, snapshots survive deletion, history logging, money, idempotent commands
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-002,FR-004,FR-006,FR-009,FR-010,FR-011,FR-037,MONEY-1,CMD-1 tests/unit/data tests/integration/data
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=49c35447227aa795dea0fe469aeaf5678e9b293e82df7bfb9bda896342c5022f; exit=0; EXPECT=matched; output-sha256=0858a12d5931595f9fec6a9928b321ad3a12e40f1e9a9d402353ed0695534e2e; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries
