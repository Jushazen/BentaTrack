# Gates: leaf 3.4 Restock and inventory history

OWNS: src/features/inventory/**, src/app/(app)/inventory-history/**, tests/integration/inventory/**, tests/e2e/inventory/**

Scope: Restock action (online path) and an inventory history page filterable by product, newest first.

SRS: §4.4 FR-010–012; amendment B2 (FR-038)

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-3.4.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-3.4.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=b78b7f1ef1559d17d02380e232ed436726bd9f00fcdca0d01c3f93825550e606; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G1: restock increases stock by the received quantity, rejects invalid quantities, and logs date, product, user, delta, stock-after
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-038,FR-038-INVALID,FR-010,FR-011,FR-012-RESTOCK tests/integration/inventory
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=7746b673f47e6df349558463eab08c39a1cfb7754c20afb2924a3b07ab396018; exit=0; EXPECT=matched; output-sha256=010fe06f69c5988e9d97199aa8ceac03e92d72705cadab5b33cbee51879dea38; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G2: restock and history view work in the browser
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-038,FR-012-VIEW tests/e2e/inventory
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=8044ccc86b27460daa50e614a1d8f248817584e596e6bc68d50d67890ccf0881; exit=0; EXPECT=matched; output-sha256=a5b477f6bae4fb36840c33e627265d5c3d3808cb6846a6dab5bd92679271bd60; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries
