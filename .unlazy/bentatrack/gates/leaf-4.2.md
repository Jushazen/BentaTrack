# Gates: leaf 4.2 Sales history and refunds

OWNS: src/features/refunds/**, src/app/(app)/sales/**, tests/integration/refunds/**, tests/e2e/refunds/**

Scope: Sales list and full or partial refunds that restore stock, record money returned, and log REFUND history.

SRS: FR-012; amendment B3 (FR-039, FR-040), C7

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-4.2.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-4.2.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=dcd89d347b24ec5b8850a9dc1798ce71668c6a7b88e8040c09a908a2c701c6c9; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G1: refunds restore stock, never exceed quantity sold, log REFUND, are idempotent, and staff may process them
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-039,FR-040,FR-012-REFUND,REFUND-IDEMPOTENT,REFUND-STAFF tests/integration/refunds
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=f0424e375e5471334b081dd4de86ace7c7f7fa438b31e4737c31116f2d415352; exit=0; EXPECT=matched; output-sha256=c1b88f706bd317007fb01d4a44c23454f3516fe908d1a5d3dd67637ef401e015; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G2: a partial refund works in the browser
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-039 tests/e2e/refunds
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=f4174732ff4149a9cd9b351b6eb1c4f6c8b384e527cab53256e415be3aa3e667; exit=0; EXPECT=matched; output-sha256=74bc2ae3ff26f38a86eec20241c66690fe7fcd95707494430ac7ec843d511956; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries
