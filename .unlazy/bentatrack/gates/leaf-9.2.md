# Gates: leaf 9.2 Every page opens offline

OWNS: src/app/sw.ts, src/app/sw-rules.ts, src/app/offline/**, src/lib/offline/read/**, src/app/(app)/products/**, src/app/(app)/categories/**, src/app/(app)/suppliers/**, src/app/(app)/users/**, src/app/(app)/account/**, src/app/(app)/inventory-history/**, src/features/products/**, src/features/categories/**, src/features/suppliers/**, src/features/users/**, src/features/inventory/**, tests/unit/offline-read/**, tests/e2e/offline-pages/**

Scope: After one online sign-in, every app page opens offline, including pages never visited and dynamic ones (one product, its edit form). The service worker keeps the page shells with no age limit and no entry cap that could push out a needed page, replacing the 7-day, 64-entry rule. Pages whose data comes from the server read it from the device store (leaf 9.1) when offline: products list and detail, categories, suppliers, users, my account, inventory history. Offline lists show the same rows, filters, and order as online. Staff offline pages never show purchase prices or suppliers. Dashboard, sales, and reports are leaf 9.3.

SRS: v2.1 FR-049 (viewing every page offline), FR-055 (every page and feature), FR-032, §3.1 Offline Page (now only shown before the first sync)

Notes:
- The caching rules move to src/app/sw-rules.ts so they can be unit-tested without a service worker.

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-9.2.md`

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-9.2.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: saved pages have no age limit or eviction cap, and device-store reads for products, categories, suppliers, users, and inventory history return the same rows as the server queries for the same data, without costs or suppliers for staff
  CHECK: node scripts/gates/require-tests.mjs vitest --ids SW-NO-EXPIRY,FR-049-READ-PARITY,FR-055-ROLE-PAGES tests/unit/offline-read
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G2: in the browser, after one online sign-in and with the network cut, every navigation page plus a never-visited product detail and edit page opens with its data, for owner and staff
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-049-PAGES,FR-055-ROLE-PAGES tests/e2e/offline-pages
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending
