# Gates: leaf 9.1 Device data store and role-scoped snapshot

OWNS: src/lib/offline/db.ts, src/lib/offline/catalog.ts, src/lib/offline/snapshot.ts, src/app/api/offline/**, src/app/api/catalog/**, src/components/offline/**, tests/unit/offline/**, tests/integration/offline/**, tests/e2e/offline/**

Scope: Each signed-in device keeps a copy of every record its user may see, so later leaves can show every page and accept every change offline. The Dexie database gains tables for products (with purchase price for the owner only), categories, suppliers, users, sales with items, refunds with items, and inventory history. A role-scoped snapshot route sends the full set on first sign-in and only what changed since a cursor afterwards, including archived products and deleted categories or suppliers. Staff devices never receive purchase prices, suppliers, or user accounts. Owner-only data is removed from the device when the owner signs out or a different user signs in. The device asks the browser for persistent storage so it is not cleared after days without use.

SRS: v2.1 FR-055, FR-049 (offline after first online login), FR-050, FR-032 (staff limits), §5.2

Notes:
- Replaces the product-only catalog of leaf 6.1 (src/lib/offline/catalog.ts, /api/catalog); search and barcode lookup must keep working from the new store.

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-9.1.md`

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-9.1.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: the snapshot holds every table the user may see, sends only changes after the first sync, never gives staff costs, suppliers, or users, and owner data is purged on sign-out or user switch
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-055,FR-055-STAFF-SCOPE,FR-055-INCREMENTAL,FR-055-SIGNOUT-PURGE,OFFLINE-PERSIST tests/unit/offline tests/integration/offline
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G2: in the browser, after one online sign-in the device holds the owner's or staff member's data, and search and barcode lookup still work offline from it
  CHECK: node scripts/gates/require-tests.mjs playwright --ids OFFLINE-SNAPSHOT,OFFLINE-CATALOG tests/e2e/offline
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G3: the first snapshot of the demo dataset downloads and is stored within 10 seconds on the throttled phone profile
  CHECK: node scripts/gates/require-tests.mjs playwright --ids OFFLINE-SNAPSHOT-PERF tests/e2e/offline
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending
