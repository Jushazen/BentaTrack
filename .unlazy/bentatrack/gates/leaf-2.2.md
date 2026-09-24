# Gates: leaf 2.2 Authentication and role permissions

OWNS: src/lib/auth.ts, src/lib/permissions.ts, src/proxy.ts, src/app/(auth)/**, src/app/api/auth/**, src/types/**, playwright.config.ts, tests/e2e/fixtures/**, tests/e2e/auth/**, tests/unit/auth/**, tests/integration/auth/**

Scope: Email/password login with NextAuth.js v4 credentials provider (JWT sessions), bcryptjs hashes, role-based route protection in src/proxy.ts (Next 16's renamed middleware), and the capability matrix from the PLAN contract.

SRS: §4.8 FR-030–033; amendments A7, B6 (FR-044, FR-046); §5.2; Figure 3

Notes:
- Install browsers once: `npx playwright install chromium`.
- Point the Playwright webServer at TEST_DATABASE_URL and seed fixture users in tests/e2e/fixtures.
- Read node_modules/next/dist/docs/01-app/02-guides/authentication.md and the proxy.md reference first (Next 16 renamed middleware to proxy).
- NextAuth v4 in the App Router: route handler at src/app/api/auth/[...nextauth]/route.ts, getServerSession(authOptions) on the server. Check that next-auth/middleware's withAuth works as a proxy export; otherwise decode the JWT with getToken in src/proxy.ts.

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-2.2.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-2.2.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=51281e6df0de0a61d91f39e75c8cd530d9c1ce2fde0385fdbfcdff7984039a49; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries

- [x] G1: credentials: passwords required, hashed, min 8 chars, emails unique and case-insensitive, deactivated users rejected
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-030,FR-044,FR-046,AUTH-DEACTIVATED tests/unit/auth tests/integration/auth
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=139ca732a328364a16ff93e56e8b8ac6fed533651a19c98f94a597ba737d3e7d; exit=0; EXPECT=matched; output-sha256=ee1c4fa81d7b7960c18e0ecc09cf4e617b1c8ca1e3779a778de641a44ff74529; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries

- [x] G2: the role capability matrix matches the PLAN contract exactly
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-031,FR-032,FR-033 tests/unit/auth
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=05fb05cd9e7e47b3e1b5bba8ec75f448feb5465e489545ae865ad109e344b9bb; exit=0; EXPECT=matched; output-sha256=362b594595800571e694f71f1c1b90d684cfae3962129323bd33071dcf5f87ba; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries

- [x] G3: in the browser, login routes by role and protected pages reject the wrong role or no session
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-030,FR-033,NFR-SEC-1 tests/e2e/auth
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=4712463776169bfa0de0df0d7dcdac68c6ab0047db4dab4320c833a5337d69d1; exit=0; EXPECT=matched; output-sha256=8b1def247443cb65adca21ea90ed861a085d3f3ef172429cb9deb337e5757ba9; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries
