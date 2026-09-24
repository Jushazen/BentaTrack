# Gates: leaf 2.3 User account management (owner)

OWNS: src/features/users/**, src/app/(app)/users/**, tests/integration/users/**, tests/e2e/users/**

Scope: Owner creates staff accounts, resets passwords, and deactivates/reactivates accounts; staff cannot reach any of it.

SRS: §3.1 User Accounts screen; FR-031, FR-032; amendment B6 (FR-045, FR-046)

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-2.3.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-2.3.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=a3cd2bc12e216dd6043698b6712a0fea4c064023576fd77175022f23a49671b1; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G1: user actions enforce owner-only access, unique emails, and password rules
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-045,FR-046,USERS-DUP,USERS-STAFF-DENIED tests/integration/users
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=75eb755c8443be02e476ee0175239c0a8351989d77ba73f97d8da09a8de232ce; exit=0; EXPECT=matched; output-sha256=ef911e03037a05fc66cbcc9f272a6fc63826ac639de64d3510e2eec316c0723a; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G2: owner creates, resets, deactivates, and reactivates a staff account in the browser
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-045 tests/e2e/users
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=6ba8790e4fe7c97a188198b45ee52a4e13cb20e36eca697d5edadaacd9208969; exit=0; EXPECT=matched; output-sha256=30fd8a8f007c4659c3f2830370c0216d039553f8256051c49903d37f20c90a21; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries
