# Gates: leaf 3.2 Products

OWNS: src/features/products/**, src/app/(app)/products/**, src/lib/storage.ts, tests/integration/products/**, tests/e2e/products/**

Scope: Product list, add, edit (logged), owner-only delete of discontinued products, image upload (Vercel Blob, local disk in dev), automatic status labels, and cost/supplier hidden from staff.

SRS: §4.2 FR-001–006; FR-009, FR-037; amendments A2, A3, A7 follow-on, B4 (FR-042)

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-3.2.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-3.2.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=a2d0b3134cad2a46ae7d31fbb400a210743c33b8f262c3f94cf1faaefdc7da9a; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G1: product actions: create/edit/delete rules, staff cannot delete or see cost/supplier, edits logged, staff-created products flagged as needing cost, images stored
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-001,FR-002,FR-003,FR-004,FR-004-STAFF,FR-042,EDIT-LOG,NEEDS-COST,IMG-1 tests/integration/products
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=5c8e41ba722ab381b83119677502016c8f7d8b90ba9df38cb821899ca10a7191; exit=0; EXPECT=matched; output-sha256=63a8b2abd53fd9e52694700a7f3350fecf5ba3674a15133db852a860899c2db6; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G2: in the browser: add with image, edit, delete, Out of Stock label, Low Stock shown separately
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-001,FR-003,FR-004,FR-006,FR-009 tests/e2e/products
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=ce009b3f682a029259f7c8678e253e145589548662c9d78ffab810c6b7c3611b; exit=0; EXPECT=matched; output-sha256=924968ed51c26202660e1d9f71061907aab2cc74c7f2caa8a7c2e25f06922cc4; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries
