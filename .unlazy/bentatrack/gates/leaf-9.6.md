# Gates: leaf 9.6 A long offline period end to end

OWNS: tests/e2e/offline-day/**, prisma/seed-demo.ts, CLAUDE.md

Scope: Proves the whole branch together. The owner signs in online once, then goes offline. Offline, they use every page and make every kind of change: a sale, a refund of an unsynced sale, a restock, product add, edit, and archive, category and supplier changes, and a staff account change. Then they close and reopen the app, still offline. On reconnect, everything syncs in the order it was made, nothing is lost, and the server's data equals the device's. On real phones with the app installed, it still opens and works after more than a week offline. CLAUDE.md's offline note is updated to say every feature works offline.

SRS: v2.1 FR-049, FR-034, FR-035, FR-036, FR-051, FR-053, FR-055, §5.3

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-9.6.md`

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-9.6.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: in the browser, a full offline session covering every page and every kind of change, with an app restart in the middle, syncs on reconnect in order with no loss and leaves server and device data equal
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-049-DAY,FR-036-DAY tests/e2e/offline-day
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G2: CLAUDE.md no longer says that edits other than sales, refunds, and restocks need a connection
  CHECK: node -e "const t=require('fs').readFileSync('CLAUDE.md','utf8');if(/Other edits (currently )?need a connection/.test(t)){console.error('stale offline note');process.exit(1)}console.log('CLAUDE OFFLINE NOTE OK')"
  EXPECT: CLAUDE OFFLINE NOTE OK
  EVIDENCE: pending

- [ ] G3: on a real Android phone and a real iPhone with the app installed, after at least 8 days offline (or the device clock moved 8 days ahead), the app opens, every page shows data, a sale can be recorded, and queued changes sync once back online
  EVIDENCE: pending
