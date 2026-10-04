# Gates: leaf 9.6 A long offline period end to end

OWNS: tests/e2e/offline-day/**, prisma/seed-demo.ts, CLAUDE.md

Scope: Proves the whole branch together. The owner signs in online once, then goes offline. Offline, they use every page and make every kind of change: a sale, a refund of an unsynced sale, a restock, product add, edit, and archive, category and supplier changes. A staff account change is also tried and is refused, because account changes need a connection (C99, rev 6), with nothing queued. Then they close and reopen the app, still offline. On reconnect, everything syncs in the order it was made, nothing is lost, and the server's data equals the device's. On real phones with the app installed, it still opens and works after more than a week offline. CLAUDE.md's offline note is updated to say every feature works offline.

SRS: v2.1 FR-049, FR-034, FR-035, FR-036, FR-051, FR-053, FR-055, §5.3

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-9.6.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-9.6.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=682b2d6459a8f98653a05820d9e0773e0ae3098751b82f3a4fe793d7206e346c; exit=0; EXPECT=matched; output-sha256=7a5dc99e2d077202234fccdc59bfcc549f23a9201058f8944a0c24565548abd1; output-bytes=499; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G1: in the browser, a full offline session covering every page and every kind of change, with an app restart in the middle, syncs on reconnect in order with no loss and leaves server and device data equal
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-049-DAY,FR-036-DAY tests/e2e/offline-day
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=6f414118f1e702bf83e4286de70997ffe7985a3193e4d94ecb6df4998650a08d; exit=0; EXPECT=matched; output-sha256=191b9e77e976bf6e664b566709e70df534586f668482f1c8a84cb648d0e2df88; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G2: CLAUDE.md no longer says that edits other than sales, refunds, and restocks need a connection
  CHECK: node -e "const t=require('fs').readFileSync('CLAUDE.md','utf8');if(/Other edits (currently )?need a connection/.test(t)){console.error('stale offline note');process.exit(1)}console.log('CLAUDE OFFLINE NOTE OK')"
  EXPECT: CLAUDE OFFLINE NOTE OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=069705e4c3b15a9284e57240287babed21617a2e4b7c65b59049003a1ffe237f; exit=0; EXPECT=matched; output-sha256=c1dbf054ec6117f578db3383c75b2ea1b739ed9c8acd8e53f3243363c7fefd96; output-bytes=23; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [ ] G3: on a real Android phone and a real iPhone with the app installed, after at least 8 days offline (or the device clock moved 8 days ahead), the app opens, every page shows data, a sale can be recorded, and queued changes sync once back online
  EVIDENCE: pending
