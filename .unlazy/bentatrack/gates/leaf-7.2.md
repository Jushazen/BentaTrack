# Gates: leaf 7.2 Deployment

OWNS: docs/DEPLOY.md, src/app/api/health/**, scripts/gates/check-deploy.mjs, tests/integration/health/**, vercel.json

Scope: Production on Vercel with Neon Postgres and Vercel Blob, migrations deployed, owner account seeded, HTTPS enforced.

SRS: §2.4 deployment; §3.4 secure connection; amendments D2, D5

Notes:
- Needs the owner's Vercel, Neon, and Blob accounts. The gates stay unmet until PRODUCTION_URL exists.

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-7.2.md`

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-7.2.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: health endpoint reports database connectivity
  CHECK: node scripts/gates/require-tests.mjs vitest --ids HEALTH-1 tests/integration/health
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G2: production serves the login page over HTTPS, redirects HTTP to HTTPS, sends HSTS, and reports a healthy database
  CHECK: node scripts/gates/check-deploy.mjs
  EXPECT: DEPLOY OK
  EVIDENCE: pending

- [ ] G3: owner logged into production and replaced the seeded password
  EVIDENCE: pending
