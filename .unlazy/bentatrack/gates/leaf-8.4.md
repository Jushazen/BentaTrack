# Gates: leaf 8.4 Refund fixes

OWNS: src/features/refunds/**, src/app/(app)/sales/**, tests/integration/refunds/**, tests/e2e/refunds/**, tests/unit/refunds/**, prisma/schema.prisma, prisma/migrations/**, tests/e2e/flows/flows.spec.ts, tests/integration/sync/sync-route.test.ts, tests/unit/sync/outbox.test.ts

Scope: A refund cannot be dated before its sale; each refunded item has a "return to stock?" choice (default yes) and unreturned units are logged but not restocked; refunds of archived products restock the archived product; a refund reason is required.

SRS: amendments H4.1–H4.4 (FR-039, FR-040), G1, C7

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-8.4.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-8.4.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=01d60e913f9e5078dfdc8eacc8adbe6e0301f32667444b29af35b8b94a86f0f1; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G1: refunds dated before the sale or without a reason are refused; unreturned units are logged but not restocked; archived products get their units back and stay archived; existing refund rules still hold
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-040-DATE,FR-039-NO-RESTOCK,FR-039-ARCHIVED,REFUND-REASON,FR-039,FR-040,REFUND-IDEMPOTENT tests/integration/refunds
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=e5d52f7a2e0e82d3e40928d5f574df1b3eb41e6c05a8fdc0a1507636de4170c3; exit=0; EXPECT=matched; output-sha256=51df15c0bd5df8a886eb0dbe4171d7456ba0b93d3d9a5667a66add0a633f584a; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G2: in the browser, staff refund one item to stock and one damaged item not to stock, with a reason
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-039-NO-RESTOCK tests/e2e/refunds
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=0d97a3bea8a8d637e9d9a33bb6e6ab2ad1a3766fe9e87ebf64733ac12cce5d28; exit=0; EXPECT=matched; output-sha256=d9ce775ed20acac1d37659d0604e6952ab3ec60ca3fc4ca80f248b1bbfe17c8d; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G3: the schema still matches the agreed data model
  CHECK: node scripts/gates/check-schema.mjs
  EXPECT: SCHEMA OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=7bad42e1c145a8a1353510cf048378c0412af39967f3a63fd7086fd5167e27b0; exit=0; EXPECT=matched; output-sha256=0ace77e0aca86206682bd5e15281f9587d721ef285898b9e4e4a7377d206c36a; output-bytes=30; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries
