# Gates: leaf 7.1 End-to-end flows and performance

OWNS: tests/e2e/flows/**, tests/perf/**, prisma/seed-demo.ts, scripts/gates/perf/**

Scope: The SRS system flow end to end, full history coverage, per-user attribution, and the page-load targets (under 1 s on 4G, under 2 s on weak 4G) on a production build.

SRS: §2.1 system flow; FR-012; §5.1, §5.2; amendment D4

Notes:
- Plan amendment (user-approved 2026-09-27): edits playwright.config.ts (leaf 2.2) to add a `perf` project for tests/perf; desktop and phone projects keep running tests/e2e.
- Contract rev 3 (team leader, 2026-09-27): C55 tightened to < 1 s on 4G (DevTools Fast 4G, 4x CPU) with < 2 s on weak 4G (Slow 4G) kept as a backstop. To make room, the product list shows 25 rows a page instead of 50 (src/features/products/queries.ts, leaf 3.2; plan amendment).

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-7.1.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-7.1.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=ec638a4656d85bde872a7e9dcb72ce6ee57b26b6491381727f78f6596641755f; exit=0; EXPECT=matched; output-sha256=7deada995c143797d4b2f7363ba68e664ddfc9f8f2dbf6837839589ed75cf6d2; output-bytes=332; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G1: login, scan, sell, stock deducted, dashboard and reports updated; history shows every change type; every change is attributed to its user
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FLOW-SYSTEM,FR-012,NFR-SEC-2 tests/e2e/flows
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=a1c2815eee911ffc64cfadd9a1608b00d625d2b8fd88baf22486296cff6ea95c; exit=0; EXPECT=matched; output-sha256=d881fa64b629b58a5c3f18df2e7ec470e0adcaf42796bc3d281bddc7bfc6f0a3; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G2: dashboard and product pages load under 1 s on a throttled phone over 4G, and under 2 s over weak 4G, with the demo dataset
  CHECK: node scripts/gates/require-tests.mjs playwright --ids NFR-PERF-1 tests/perf
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=891cef394a417c6ce8dc2c7779dca68904880985d818a1e322a38d4f08bf7774; exit=0; EXPECT=matched; output-sha256=542f5373cb485485ff97c0f3c3dd1e82603db3841b40bf8ab36262640699101a; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [ ] G3: on a real phone, offline use feels as fast as online use (§5.1 bullet 4)
  EVIDENCE: pending
