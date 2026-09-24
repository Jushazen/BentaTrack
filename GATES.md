# Gates: project setup (PLAN leaf 1.1)

OWNS: package.json, package-lock.json, .gitignore, .env.example, docker-compose.yml, eslint.config.mjs, tsconfig.json, next.config.ts, postcss.config.mjs, .prettierrc.json, .prettierignore, vitest.config.mts, playwright.config.ts, prisma.config.ts, prisma/**, src/**, tests/**, scripts/gates/**, scripts/plan/**, public/**, docs/SRS-V2-amendments.md, .unlazy/bentatrack/**, AGENTS.md, CLAUDE.md, GATES.md

Scope: a Next.js 16 + Prisma 7 project whose dependencies install cleanly and which type-checks, lints, formats, builds, starts, and runs tests with no feature logic yet.

Run from the repository root in PowerShell or cmd with Node 24 on PATH:
`node .claude/skills/unlazy/scripts/gate-check.mjs --timeout 900 GATES.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs GATES.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=62f9b2f96b674ee169b65e92260aa9abecc87fcb494c1f98077ea878d6974f55; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries

- [x] G1: dependencies install cleanly from the lockfile with zero known vulnerabilities
  CHECK: npm ci
  EXPECT: found 0 vulnerabilities
  EVIDENCE: automatic-evidence=v1; definition-sha256=259ffee9eb3dcb32213f8a12c77729e65e0efc2ae65898ae5fe52a95ab0bd63d; exit=0; EXPECT=matched; output-sha256=8d205525a486f56b1e4dca5d822a150532c895d8412410d5bed58708629e9591; output-bytes=282; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries

- [x] G2: the Prisma schema and prisma.config.ts are valid
  CHECK: npx prisma validate
  EXPECT: is valid
  EVIDENCE: automatic-evidence=v1; definition-sha256=17f8109f218cb31840cf57fd22787904f426ff4d0113518a2d2bdacaede8896c; exit=0; EXPECT=matched; output-sha256=53823a8303dc253a67eab7af8493de1b2bf15edfe088388ee7d68042606da548; output-bytes=175; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries

- [x] G3: TypeScript reports zero type errors
  CHECK: npm run typecheck && node -e "console.log('TYPECHECK OK')"
  EXPECT: TYPECHECK OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=4305bc13aaef42c23038ae30c8017f3af2bef3c1fa5c1147f6c3327b41619398; exit=0; EXPECT=matched; output-sha256=709a0609633fa293124436a9f5f92143d1fa2dbf1c6a3a59f6ccbd017463e772; output-bytes=134; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries

- [x] G4: ESLint reports zero errors and zero warnings
  CHECK: npm run lint && node -e "console.log('LINT CLEAN')"
  EXPECT: LINT CLEAN
  EVIDENCE: automatic-evidence=v1; definition-sha256=0865cca3f0f3eeb24dd86b4d71356234a90ba76d3550e8ba32ddfcf3e8a05dd7; exit=0; EXPECT=matched; output-sha256=9e5888329d47c8f293333f9f60cc449bdc36098fe5fc318ad8ac06ce7593e9db; output-bytes=65; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries

- [x] G5: every source file matches Prettier formatting
  CHECK: npm run format:check
  EXPECT: All matched files use Prettier code style
  EVIDENCE: automatic-evidence=v1; definition-sha256=9e4467fd189797deae4ebcbfc05dafc1783dee01dcaeccf2f2c3ad5d920dda4f; exit=0; EXPECT=matched; output-sha256=60476f2c258865c1e7d20df792f6db917c77c73cfd6d2f419a27c2b666976071; output-bytes=121; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries

- [x] G6: the production build compiles
  CHECK: npm run build
  EXPECT: /Compiled successfully/
  EVIDENCE: automatic-evidence=v1; definition-sha256=913acd00766cb43549aaebd0c1c45beed944a0ca2f0d85005304fa0c8f5dc661; exit=0; EXPECT=matched; output-sha256=e7dd31ebb0366caf9315d6f5fcb197e9429fd04ca6f19774cac68b2d3e857a03; output-bytes=993; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries

- [x] G7: the dev server starts and serves the home page with HTTP 200 and no error overlay
  CHECK: node scripts/gates/check-dev-server.mjs
  EXPECT: DEV SERVER OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=b10cdd1b8cb39f826f1f36e2b9182bc08fa2c06c988c71930394a14968c94837; exit=0; EXPECT=matched; output-sha256=688afcfd02daa91fb82f796833eeab6b159cafac8c5ca5cee0f8b79e90d171bc; output-bytes=37; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries

- [x] G8: the unit test runner executes the smoke tests and all pass
  CHECK: npm test
  EXPECT: /Tests\s+\d+ passed \(\d+\)/
  EVIDENCE: automatic-evidence=v1; definition-sha256=c272898e03882393443af772473570173cc4e8b77ab99d2b0c80e22ad3b67b38; exit=0; EXPECT=matched; output-sha256=a3dbbdb1e5a1bc78a2eddb5824f1df601fa64ed218fa7778512ac6429f788fbe; output-bytes=234; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries

- [x] G9: .env is git-ignored, .env.example is committed, and the example holds no real secrets
  CHECK: node scripts/gates/check-env-safety.mjs
  EXPECT: ENV SAFETY OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=914ab841f991845a15b1fbf655eaaded86e9ba2821eab56d1d3f1b1906b9ec3c; exit=0; EXPECT=matched; output-sha256=6cdcff8bc991348f213e5ec0c5ceed29ad094996a2158dba9645a921da5607e5; output-bytes=14; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries

- [x] G10: the agreed folder structure, CLAUDE.md, and PLAN.md exist
  CHECK: node scripts/gates/check-structure.mjs
  EXPECT: STRUCTURE OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=ed75cde50b515a6561f9d0ddde89c44ff1d7d55c0899add18fa76cbe9c1a6174; exit=0; EXPECT=matched; output-sha256=33f74bb10408db0c10067b75e3b0844336981b9bfdcb53f02ca75fbaa2942666; output-bytes=24; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries

- [x] G11: every PLAN leaf has one dispatch row and a ledger whose OWNS matches the PLAN mirror
  CHECK: node scripts/gates/check-plan-owns.mjs
  EXPECT: PLAN OWNS OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=57e2e403dfe8b68375f32e839bc462b7036e84c0d2502073d06afe54b5a81cb8; exit=0; EXPECT=matched; output-sha256=b69e29b32a0904dab15b6a73915c451263ed688ffcd4c542244c87fd4a2c4a34; output-bytes=25; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=34fb150471ae/43 entries
