# Gates: leaf 7.2 Deployment

OWNS: docs/DEPLOY.md, src/app/api/health/**, scripts/gates/check-deploy.mjs, tests/integration/health/**, vercel.json

Scope: Production on Vercel with Neon Postgres and Vercel Blob, migrations deployed, owner account seeded, HTTPS enforced.

SRS: §2.4 deployment; §3.4 secure connection; amendments D2, D5

Notes:
- Needs the owner's Vercel, Neon, and Blob accounts. The gates stay unmet until PRODUCTION_URL exists.
- Decisions (user, 2026-09-27): `prisma migrate deploy` runs in the Vercel build over DATABASE_URL_UNPOOLED; previews must use Neon preview branches. The owner sets their own password by typing SEED_OWNER_PASSWORD at seed time (docs/DEPLOY.md step 5); a one-time reset script was deleted, not committed. G3 is met when the owner logs into production with a password only they chose.
- Plan amendment: adds a PRODUCTION_URL placeholder to .env.example (leaf 1.1).

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-7.2.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-7.2.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=8ad24c15c85404ed3f4607e1138afd6cf470836ec3e4fb241d958f1bf744fa72; exit=0; EXPECT=matched; output-sha256=92f957c9bb067276c047813d3e6af8a3037a30395a6a88209d7f6e1360e4b342; output-bytes=178; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G1: health endpoint reports database connectivity
  CHECK: node scripts/gates/require-tests.mjs vitest --ids HEALTH-1 tests/integration/health
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=8b8af5b587495f34a5c23782e33e255685d15d9af9f8674e2ac43721d06d76d4; exit=0; EXPECT=matched; output-sha256=74bc2ae3ff26f38a86eec20241c66690fe7fcd95707494430ac7ec843d511956; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [ ] G2: production serves the login page over HTTPS, redirects HTTP to HTTPS, sends HSTS, and reports a healthy database
  CHECK: node scripts/gates/check-deploy.mjs
  EXPECT: DEPLOY OK
  EVIDENCE: pending

- [ ] G3: owner logged into production and replaced the seeded password
  EVIDENCE: pending
