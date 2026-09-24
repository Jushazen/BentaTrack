# Gates: leaf 3.3 Categories and suppliers (owner)

OWNS: src/features/categories/**, src/features/suppliers/**, src/app/(app)/categories/**, src/app/(app)/suppliers/**, tests/integration/catalog/**, tests/e2e/catalog/**

Scope: Owner-only management of categories and supplier records; staff may read category names only.

SRS: FR-031, FR-032; amendments B4 (FR-041, FR-042), B5 (FR-043)

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-3.3.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-3.3.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=388364fc9f272eb932b95382d292175eb53e7009da105ec1fdacecdd0120de4f; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G1: category and supplier rules: owner CRUD, in-use category cannot be deleted, staff denied supplier access
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-041,FR-043,FR-043-INUSE,FR-042-STAFF tests/integration/catalog
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=3be996e2046a9b7a4b5ca188001dd02e3213eb328d3183614b7dad7ee2ecc637; exit=0; EXPECT=matched; output-sha256=ef911e03037a05fc66cbcc9f272a6fc63826ac639de64d3510e2eec316c0723a; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G2: owner manages categories and suppliers in the browser
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-041,FR-043 tests/e2e/catalog
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=04801050dceb27ed02fd0c1d7622cb1279791c4a0e84cac1fed4ab57727a6a8b; exit=0; EXPECT=matched; output-sha256=096dbd1c1ebbfab7275b2f0fdbd3c63a6aa0700f83a56beee10a806c177f95ed; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries
