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

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-2.2.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: credentials: passwords required, hashed, min 8 chars, emails unique and case-insensitive, deactivated users rejected
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-030,FR-044,FR-046,AUTH-DEACTIVATED tests/unit/auth tests/integration/auth
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G2: the role capability matrix matches the PLAN contract exactly
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-031,FR-032,FR-033 tests/unit/auth
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G3: in the browser, login routes by role and protected pages reject the wrong role or no session
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-030,FR-033,NFR-SEC-1 tests/e2e/auth
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending
