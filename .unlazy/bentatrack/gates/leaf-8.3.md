# Gates: leaf 8.3 Archive discontinued products

OWNS: src/features/products/**, src/app/(app)/products/**, tests/integration/products/**, tests/e2e/products/**, tests/integration/archive/**, prisma/schema.prisma, prisma/migrations/**, prisma/seed-demo.ts, scripts/gates/check-schema.mjs, src/lib/permissions.ts, src/features/search/queries.ts, src/features/sales/actions.ts, src/features/inventory/actions.ts, src/features/inventory/history-list.tsx, src/features/dashboard/queries.ts, src/app/(app)/layout.tsx, CLAUDE.md

Scope: Replace permanent product deletion with archive/restore (owner only). Archived products are hidden from the product list (except an owner-only Archived filter), search, barcode lookup, checkout, the offline catalog, low-stock alerts and dashboard stock figures; they cannot be sold, restocked or edited until restored; codes and barcodes stay reserved. History types Archive and Restore replace Removal.

SRS: amendments H1 (FR-004, FR-057–059), A2, A7, C1, C3

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-8.3.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-8.3.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=b10d64ba55da17fa8621be9aa790aef90617cd40b56e7dcc9e9adb2ffeb8c77a; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G1: archive and restore are owner-only, logged, never delete, and keep codes reserved; archived products cannot be sold, restocked, or edited
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-004,FR-058,FR-059,ARCHIVE-STAFF-DENIED tests/integration/products tests/integration/archive
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=9f2a9451f8c97ae49a8060270d7c2f0e50b6bb26d9827226ddfda87dfe4e8702; exit=0; EXPECT=matched; output-sha256=5ffb01b8fadd319b595d24c86aa249e894d16a0066bddec360e8bbe2226cd684; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G2: archived products are left out of the list, search, lookup, offline catalog, low-stock count, and dashboard figures, but stay in sales history and reports
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-057 tests/integration/archive
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=9a9f2e28f4823d22493918da38144fd581887528ae96b58333a7cfa6e629d0d6; exit=0; EXPECT=matched; output-sha256=efcfeb7270449a0878f24e6feb4da07f9ef81c3bd5b1edc5a61b22352470b5df; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G3: the owner archives a product and restores it from the Archived filter in the browser
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-004 tests/e2e/products
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=e477d3fdcd9b38f4bbd0a4b8e71cfe3ea02ada705959fc4e00a14a7ed80b4986; exit=0; EXPECT=matched; output-sha256=456cfb1bfcbca1f6cdb03fcd4de632c8caa3764b01f8d27ece5cd8ed093f061e; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G4: the schema matches the amended data model (Product.archivedAt; change types Archive and Restore, no Removal)
  CHECK: node scripts/gates/check-schema.mjs
  EXPECT: SCHEMA OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=7bad42e1c145a8a1353510cf048378c0412af39967f3a63fd7086fd5167e27b0; exit=0; EXPECT=matched; output-sha256=0ace77e0aca86206682bd5e15281f9587d721ef285898b9e4e4a7377d206c36a; output-bytes=30; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries
