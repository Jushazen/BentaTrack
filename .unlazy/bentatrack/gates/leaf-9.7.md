# Gates: leaf 9.7 Branch 9 test fixes and category row on phones

OWNS: tests/e2e/branch-9-fixes/**, tests/integration/offline-sales/offline-sales.test.ts, tests/e2e/offline/offline.spec.ts, tests/e2e/offline/snapshot.spec.ts, tests/e2e/products/products.spec.ts, tests/e2e/sync/sync.spec.ts, tests/e2e/sync-accounts/sync-accounts.spec.ts, src/features/categories/category-manager.tsx; only if the session investigation finds an app bug: src/lib/auth.ts, src/proxy.ts, src/app/sw.ts, src/app/sw-rules.ts, src/components/offline/**, src/app/offline/**, src/lib/offline/read/**

Scope: Closing branch 9 (node-9, 2026-10-04) found end-to-end tests that fail in the full run. This leaf makes them pass for the right reason, and fixes one layout bug the user reported. (1) After a test clears the cookies to switch from staff to owner, the login page sometimes shows the staff member's dashboard instead, while online (FR-004 test). Find out whether a device whose session is gone stays signed in while online; if so, fix the app so it shows the login page; if it is only how the test switches users, fix the test. (2) ACCOUNT-ONLINE-ONLY goes offline before the device has finished saving its data, and FR-050 OFFLINE-LINKS and SYNC-NOTIFY time out waiting for the service worker: make them wait for the right signal. (3) The first-snapshot speed test is over its 10-second budget; re-measure on an idle machine. If it is still over, it is a performance problem to report to the user, never a budget to loosen. (4) On a phone, a category that is in use shows "In use, so it can't be deleted" over the category's name; the name and the note must not overlap at phone width.

SRS: v2.1 FR-004, FR-040, FR-045, FR-049, FR-050, FR-051, FR-055, NFR usability (mobile layout)

Notes:
- Added 2026-10-04 by plan amendment (approved by the user) after node-9 N1 and N4 failed: 158 of 164 e2e tests passed; failures in sync.spec.ts:142 (desktop + phone, failing since before leaf 9.4), products.spec.ts:115 FR-004, offline.spec.ts FR-050, snapshot.spec.ts OFFLINE-SNAPSHOT-PERF, sync-accounts.spec.ts ACCOUNT-ONLINE-ONLY (phone). The category row bug was reported by the user the same day.
- Takes the listed test files from leaves 3.2/8.3 (products), 6.1/9.1 (offline), 6.2 (sync), 9.5 (sync-accounts), and the category manager from leaf 3.3/9.4. The conditional app files are touched only if (1) is an app bug; each one used is named in the status log.
- No test may be weakened, skipped, or given a looser budget to pass (CLAUDE.md rules).

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 3600 .unlazy/bentatrack/gates/leaf-9.7.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-9.7.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=f3d7f0b5c06259a26be4e256953f4936bb3a48814fb79a6e50dff720fa022317; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G1: at phone width, an in-use category's name and its "can't be deleted" note do not overlap, and both are fully visible
  CHECK: node scripts/gates/require-tests.mjs playwright --ids CATEGORY-ROW-PHONE tests/e2e/branch-9-fixes
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=60cd93db7eb5647ea6a8e3d64bc375be9d136baadbf54b367f00016920c7bc4d; exit=0; EXPECT=matched; output-sha256=d9ce775ed20acac1d37659d0604e6952ab3ec60ca3fc4ca80f248b1bbfe17c8d; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G2: online, a device whose session cookie is gone is shown the login page, never the previous user's pages, and the owner can then sign in and archive and restore a product
  CHECK: node scripts/gates/require-tests.mjs playwright --ids SESSION-CLEARED-ONLINE,FR-004 tests/e2e/branch-9-fixes tests/e2e/products
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=1c3456cb29aa767977cbab4816efbb79bd1d2c557429356acc597c4fbffb0ea1; exit=0; EXPECT=matched; output-sha256=3b39819ceb8f284a19bb978c97eb9700c9d4896cde839e1dfcdf1101de531e03; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G3: the offline, sync, and account tests that failed in the branch run pass, with their files run whole
  CHECK: node scripts/gates/require-tests.mjs playwright --ids ACCOUNT-ONLINE-ONLY,OFFLINE-LINKS,SYNC-NOTIFY,OFFLINE-SNAPSHOT-PERF tests/e2e/sync-accounts tests/e2e/offline tests/e2e/sync
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=54e0e72fed0d0e2f1eaad6d07d0bddee19a0ab42547cde4b2ab878b3f2f661b8; exit=0; EXPECT=matched; output-sha256=6f15be1180640d2fa5e13eac65fb2b2f90d8ef9a3ef96c16a965c3d5d33708f9; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G4: the whole end-to-end suite passes on desktop and phone in one run
  CHECK: npx playwright test
  EXPECT: /\d+ passed/
  EVIDENCE: automatic-evidence=v1; definition-sha256=7ce48e19e1b26a3799347f24c60626cfc78087636ceedb617fe004283c250e18; exit=0; EXPECT=matched; output-sha256=4b11263a92d6bca82858fc31f33c7158e3464eeb6b9cce0dedb8464a80552da1; output-bytes=27723; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G5: the offline dashboard parity test passes at any time of day, including just after midnight in Manila (its clock is pinned to the latest Manila noon)
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-049-DASHBOARD-PARITY tests/integration/offline-sales
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=3ef6ceff067bf9f45dcbe89a717f8edf5cdf3cc81c15c3f286d80141accd9ab7; exit=0; EXPECT=matched; output-sha256=d5d437e1d65ade116ec2f55b5c3bf57007810437e0138860548509218ec748fb; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries
