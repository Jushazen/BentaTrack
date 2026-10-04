# Gates: leaf 9.2 Every page opens offline

OWNS: src/app/sw.ts, src/app/sw-rules.ts, src/app/offline/**, src/lib/offline/read/**, src/app/(app)/products/**, src/app/(app)/categories/**, src/app/(app)/suppliers/**, src/app/(app)/users/**, src/app/(app)/account/**, src/app/(app)/inventory-history/**, src/features/products/**, src/features/categories/**, src/features/suppliers/**, src/features/users/**, src/features/inventory/**, tests/unit/offline-read/**, tests/integration/offline-read/**, tests/e2e/offline-pages/**, tests/e2e/offline/offline.spec.ts (amended 2026-10-04: [OFFLINE-CATALOG] and [OFFLINE-LINKS] expected the old saved-copy behaviour for /inventory-history), src/components/offline/offline-catalog-sync.tsx (amended 2026-10-04: stop asking the worker to save offline-app pages, which are no longer kept), tests/e2e/sync/sync.spec.ts (amended 2026-10-04: its setup waited for /products/<id> to be kept as a page copy; it now waits for the saved session, and the offline restock it tests is unchanged)

Scope: After one online sign-in, every app page opens offline, including pages never visited and dynamic ones (one product, its edit form). The service worker keeps the page shells with no age limit and no entry cap that could push out a needed page, replacing the 7-day, 64-entry rule. Pages whose data comes from the server read it from the device store (leaf 9.1) when offline: products list and detail, categories, suppliers, users, my account, inventory history. Offline lists show the same rows, filters, and order as online. Staff offline pages never show purchase prices or suppliers. Dashboard, sales, and reports are leaf 9.3.

SRS: v2.1 FR-049 (viewing every page offline), FR-055 (every page and feature), FR-032, §3.1 Offline Page (now only shown before the first sync)

Notes:
- The caching rules move to src/app/sw-rules.ts so they can be unit-tested without a service worker.
- Amended 2026-10-04: read parity is checked against the real server queries, which need the test database, so G1 also runs tests/integration/offline-read (unit tests have no database).

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-9.2.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-9.2.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=9e0b2349b62941e77b5647d3e4e192dc2f8fe586703c92c74f9e8fc84ceb2ab3; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G1: saved pages have no age limit or eviction cap, and device-store reads for products, categories, suppliers, users, and inventory history return the same rows as the server queries for the same data, without costs or suppliers for staff
  CHECK: node scripts/gates/require-tests.mjs vitest --ids SW-NO-EXPIRY,FR-049-READ-PARITY,FR-055-ROLE-PAGES tests/unit/offline-read tests/integration/offline-read
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=07de3d28083c8af6d19b2cf176b993d2d389166a0546c7cbd9755c1f9e9d9d09; exit=0; EXPECT=matched; output-sha256=46c0fa1da2ffd6e268850f9364752326a581b75162b2075f467bfc0dddca7699; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G2: in the browser, after one online sign-in and with the network cut, every navigation page plus a never-visited product detail and edit page opens with its data, for owner and staff
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-049-PAGES,FR-055-ROLE-PAGES tests/e2e/offline-pages
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=087cb028f2a366c9151095eaf63d45244b88bea06708300558330d5440f943c7; exit=0; EXPECT=matched; output-sha256=a5b477f6bae4fb36840c33e627265d5c3d3808cb6846a6dab5bd92679271bd60; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries
