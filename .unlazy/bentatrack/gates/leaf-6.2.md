# Gates: leaf 6.2 Offline outbox and sync

OWNS: src/lib/offline/outbox.ts, src/lib/offline/sync.ts, src/lib/commands.ts, src/app/api/sync/**, src/components/sync/**, tests/unit/sync/**, tests/integration/sync/**, tests/e2e/sync/**

Scope: Sales, refunds, and restocks queue in an IndexedDB outbox when offline, replay in order and idempotently on reconnect, never get lost, and the UI shows online status, pending count, and sync results.

SRS: §3.4, §4.9 FR-034–036, §5.3; amendment B10 (FR-049, FR-051); Figure 4

Notes:
- Takes ownership of src/lib/commands.ts from leaf 2.1 (plan amendment logged when this leaf starts).

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-6.2.md`

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-6.2.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: outbox survives reloads, replays in order, never double-applies, keeps failed items, and product edits refuse offline
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-034,FR-035,FR-036,SYNC-ORDER,FR-049 tests/unit/sync tests/integration/sync
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G2: in the browser: an offline sale syncs on reconnect with no loss and the user is told when sync completes or fails
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-034,FR-035,FR-036,FR-051,SYNC-NOTIFY tests/e2e/sync
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending
