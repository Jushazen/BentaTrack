# Gates: leaf 9.3 Sales, dashboard, and reports offline

OWNS: src/lib/offline/sales-read.ts, src/lib/offline/outbox.ts, src/app/api/sync/**, src/app/(app)/sales/**, src/app/(app)/dashboard/**, src/app/(app)/reports/**, src/features/sales/**, src/features/refunds/**, src/features/dashboard/**, src/features/reports/**, tests/unit/offline-sales/**, tests/integration/offline-sales/**, tests/e2e/offline-sales/**, src/lib/offline/sync.ts (amended 2026-10-04: a refund made while its sale is still queued stays queued, so it reaches the server after the sale), src/lib/offline/read/routes.ts, src/lib/offline/read/pages.ts, src/app/offline/offline-app.tsx (amended 2026-10-04: the offline app draws the sales and report pages and the dashboard), src/app/sw-rules.ts, tests/unit/offline-read/sw-rules.test.ts, tests/e2e/offline-pages/offline-pages.spec.ts, tests/e2e/offline/offline.spec.ts (amended 2026-10-04: the dashboard and the sales and report pages are no longer kept as page copies; the tests waited for them)

Scope: Sales history, one sale, the owner and staff dashboards, and the sales reports work offline from the device store. They include changes made offline that have not synced yet, marked as waiting to sync. Report and dashboard figures come from the same calculation code online and offline, so for the same data they match to the centavo. A sale recorded offline can be refunded before it syncs: the refund is queued after its sale and the server applies them in that order.

SRS: v2.1 FR-049 (refund before sync; figures include unsynced changes), FR-021–FR-025, FR-023a, FR-047, FR-039, FR-040, FR-054

Notes:
- Replaces the earlier rule (former amendment H4.6) that an offline sale can be refunded only after it syncs.

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-9.3.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-9.3.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=e8def13ebbee9a171f13a2aa75155ad192f16c789148d5e1df4b80f7099423ff; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G1: offline reports and dashboards equal the server's for the same data, unsynced changes appear marked as waiting, and a refund of an unsynced sale syncs after its sale and is accepted
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-049-REPORT-PARITY,FR-049-DASHBOARD-PARITY,FR-049-PENDING-VISIBLE,FR-049-REFUND-UNSYNCED tests/unit/offline-sales tests/integration/offline-sales
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=bb343323a125687cc55584704b72008ef499713a05dbe23c84866a2db6631cc9; exit=0; EXPECT=matched; output-sha256=43de8796006e4443f2b4215525ed46f8915b5321f4dbc976a1127d0aeeca9a22; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G2: in the browser while offline, a new sale shows in sales history, the dashboard, and today's report, is refunded before sync, and both sync on reconnect
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-049-PENDING-VISIBLE,FR-049-REFUND-UNSYNCED,FR-049-REPORT-OFFLINE tests/e2e/offline-sales
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=1f54de3cbf954156d9f2ed23f6754abe1467eb4409bfb9d5f27fe13a639055c5; exit=0; EXPECT=matched; output-sha256=c3c80d3c1e590d4edbcea6f817f00ae2064589db6b868244e1aa75eadc0051e6; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries
