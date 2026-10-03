# Gates: leaf 8.1 Owner password change

OWNS: src/features/account/**, src/app/(app)/account/**, src/app/(auth)/session-ended/**, tests/integration/account/**, tests/e2e/account/**, prisma/schema.prisma, prisma/migrations/**, src/lib/auth.ts, src/lib/permissions.ts, src/types/**, src/components/layout/nav-items.ts, src/app/(auth)/login/page.tsx, src/features/users/actions.ts

Scope: The owner changes their own password (current + new). Staff cannot. Every signed-in device of that account, including the current one, is signed out (session version on the user, checked on each request); the owner's reset of a staff password does the same for that staff account. A session that is no longer valid (password changed, account deactivated) is sent to the login page with a short explanation instead of looping between /login and /dashboard.

SRS: amendments H2 (FR-060), F5 (FR-045 "takes effect immediately"), FR-046

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-8.1.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-8.1.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=06d437cce131efb3b3c9f3e7cca3128a6a7ace7447e55f60ae6ed953e0a1bfc0; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G1: the change-password action checks the current password and length, refuses staff, and ends the account's sessions; a staff password reset ends that staff member's sessions
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-060,FR-060-WRONG-CURRENT,FR-060-STAFF-DENIED,FR-060-SESSIONS,FR-045-SESSIONS,SESSION-ENDED tests/integration/account
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=e6c0376123e204473bfb7314f648d307f63efe3de7aa048928f29f139a5f6ad4; exit=0; EXPECT=matched; output-sha256=a6be276c746f2a4f5aa1106d14ff51c7ed30029343458cb4d1ed8626ed77dd8a; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G2: in the browser, the owner changes their password, is asked to log in again, the new password works, and a second signed-in device is signed out; staff have no My Account page
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-060,FR-060-STAFF-DENIED tests/e2e/account
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=a820f7bc598655f8f6f3c29ac2d0c9db38debf77910d013d85ec852c6412dd77; exit=0; EXPECT=matched; output-sha256=35bd54fcb9cc50d2dc64ffa8790fe9a82275238a3b6816c4b68003a0518b2500; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G3: a signed-in user who is deactivated lands on the login page with an explanation (no redirect loop)
  CHECK: node scripts/gates/require-tests.mjs playwright --ids SESSION-ENDED tests/e2e/account
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=2aab718cf4a232bd8e2c9c90bc9bef336b30fddf7e32099e8bab942e47c77915; exit=0; EXPECT=matched; output-sha256=30fd8a8f007c4659c3f2830370c0216d039553f8256051c49903d37f20c90a21; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G4: the schema still matches the agreed data model
  CHECK: node scripts/gates/check-schema.mjs
  EXPECT: SCHEMA OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=7bad42e1c145a8a1353510cf048378c0412af39967f3a63fd7086fd5167e27b0; exit=0; EXPECT=matched; output-sha256=0ace77e0aca86206682bd5e15281f9587d721ef285898b9e4e4a7377d206c36a; output-bytes=30; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries
