# Gates: leaf 6.2 Offline outbox and sync

OWNS: src/lib/offline/outbox.ts, src/lib/offline/sync.ts, src/lib/commands.ts, src/app/api/sync/**, src/components/sync/**, tests/unit/sync/**, tests/integration/sync/**, tests/e2e/sync/**

Scope: Sales, refunds, and restocks queue in an IndexedDB outbox when offline, replay in order and idempotently on reconnect, never get lost, and the UI shows online status, pending count, and sync results.

SRS: §3.4, §4.9 FR-034–036, §5.3; amendment B10 (FR-049, FR-051); Figure 4

Notes:
- Takes ownership of src/lib/commands.ts from leaf 2.1 (plan amendment logged when this leaf starts).

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-6.2.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-6.2.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=9cd6bcc275562ec1031f14a1dc2142d1b12fa1e25f069eb1c6b5419d2bd1c527; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G1: outbox survives reloads, replays in order, never double-applies, keeps failed items, and product edits refuse offline
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-034,FR-035,FR-036,SYNC-ORDER,FR-049 tests/unit/sync tests/integration/sync
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=43e08ddfe62f331b235653b73bc30d023e08c2143328b0d21bf8ee966d93e5cd; exit=0; EXPECT=matched; output-sha256=a3960ff3a1ffe2603e3a4199dca0143c319014500dcfdcc1a3ea2ff7534a0ea3; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G2: in the browser: an offline sale syncs on reconnect with no loss and the user is told when sync completes or fails
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-034,FR-035,FR-036,FR-051,SYNC-NOTIFY tests/e2e/sync
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=9afcc41f189f966a225214689e171ac4d9e8d46aa176abbc1df1146c213b598c; exit=0; EXPECT=matched; output-sha256=35fed2725b144e0821782b09b45b0f0a070038d719f6bec26c983c5862a829bc; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries
