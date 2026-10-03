# Gates: leaf 9.3 Sales, dashboard, and reports offline

OWNS: src/lib/offline/sales-read.ts, src/lib/offline/outbox.ts, src/app/api/sync/**, src/app/(app)/sales/**, src/app/(app)/dashboard/**, src/app/(app)/reports/**, src/features/sales/**, src/features/refunds/**, src/features/dashboard/**, src/features/reports/**, tests/unit/offline-sales/**, tests/integration/offline-sales/**, tests/e2e/offline-sales/**

Scope: Sales history, one sale, the owner and staff dashboards, and the sales reports work offline from the device store. They include changes made offline that have not synced yet, marked as waiting to sync. Report and dashboard figures come from the same calculation code online and offline, so for the same data they match to the centavo. A sale recorded offline can be refunded before it syncs: the refund is queued after its sale and the server applies them in that order.

SRS: v2.1 FR-049 (refund before sync; figures include unsynced changes), FR-021–FR-025, FR-023a, FR-047, FR-039, FR-040, FR-054

Notes:
- Replaces the earlier rule (former amendment H4.6) that an offline sale can be refunded only after it syncs.

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-9.3.md`

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-9.3.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: offline reports and dashboards equal the server's for the same data, unsynced changes appear marked as waiting, and a refund of an unsynced sale syncs after its sale and is accepted
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-049-REPORT-PARITY,FR-049-DASHBOARD-PARITY,FR-049-PENDING-VISIBLE,FR-049-REFUND-UNSYNCED tests/unit/offline-sales tests/integration/offline-sales
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G2: in the browser while offline, a new sale shows in sales history, the dashboard, and today's report, is refunded before sync, and both sync on reconnect
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-049-PENDING-VISIBLE,FR-049-REFUND-UNSYNCED,FR-049-REPORT-OFFLINE tests/e2e/offline-sales
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending
