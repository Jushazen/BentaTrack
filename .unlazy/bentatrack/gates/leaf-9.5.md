# Gates: leaf 9.5 Account sessions on reconnect

OWNS: src/lib/offline/outbox.ts, src/lib/offline/sync.ts, src/app/api/sync/**, src/features/users/**, src/features/account/**, src/app/(auth)/session-ended/**, src/lib/auth.ts, src/components/offline/**, src/components/sync/**, prisma/schema.prisma, prisma/migrations/**, tests/unit/sync-accounts/**, tests/integration/sync-accounts/**, tests/e2e/sync-accounts/**

Scope: Managing user accounts and changing passwords need a connection (SRS v2.1 FR-049 exception). Offline, the users and My account pages still open, but their changes are refused at once with a message that a connection is needed; nothing is queued, so no password is ever stored on the device. When a device reconnects, a session ended meanwhile by deactivation, a staff password reset, or the owner's password change signs out, owner-only data is removed (leaf 9.1), and the user lands on the session-ended page; changes waiting to sync stay. A deactivated staff member's queued changes are not lost: the owner can send those made before the deactivation from that device, still under the staff member's name; later ones are refused and kept.

SRS: v2.1 FR-034, FR-045, FR-060, FR-049, FR-050, FR-053, FR-036, §5.2

Notes:
- Decided 2026-10-03 (option B): changes a staff member queued on a device before their account was deactivated are not lost. When the owner signs in on that device, they see them listed by person (e.g. "3 changes by Ana, account deactivated") and can send them. The changes are still recorded under the staff member's name (§5.2), not the owner's. The server accepts them only if they were made (FR-054 device time) before the account was deactivated; later ones are refused and kept (FR-053). Staff never see or send another person's queued changes.
- Takes ownership of the outbox and sync files from leaf 9.4 and of src/components/offline/** from leaf 9.1 (plan amendment logged when this leaf started).
- Amendment 2026-10-04 (approved by the user): also owns src/components/sync/** (the "send a deactivated staff member's changes" control lives in the sync panel) and prisma/schema.prisma + prisma/migrations/** (User.deactivatedAt, needed to accept only changes made before deactivation).
- Amendment 2026-10-04, contract rev 6 (decided by the user): account management and password changes no longer work offline. The SRS was changed to match (FR-034, FR-045, FR-049, FR-060, offline constraint). The offline account changes and offline password change built earlier that day were removed. Gates rewritten: G1 and G2 now check that account changes are refused offline and nothing is queued (ACCOUNT-ONLINE-ONLY, OFFLINE-NO-PLAINTEXT) instead of offline account sync; the former manual G3 (review of passwords stored on the device) was removed because no password material is ever stored now, which G1 checks by test.

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-9.5.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-9.5.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=c4ff4622a9824c42e082bcdcd10701c891fff8b9a57e67b369a6a68fd497fce0; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G1: account and password changes are refused offline with a message and never queued or sent through device sync, no typed password reaches the device store, a device whose session was ended by deactivation, a staff password reset, or the owner's password change is sent to sign out on reconnect with owner data removed and queued changes kept, and the owner can send a deactivated staff member's earlier changes under that staff member's name while later ones are refused
  CHECK: node scripts/gates/require-tests.mjs vitest --ids ACCOUNT-ONLINE-ONLY,OFFLINE-NO-PLAINTEXT,FR-045-RECONNECT,FR-060-RECONNECT,FR-036-DEACTIVATED-SEND,FR-036-DEACTIVATED-AFTER tests/unit/sync-accounts tests/integration/sync-accounts
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=ca7d0724cbd587437653cec397f0120d4503a6db01b7488c0ee1a7dd22aa9037; exit=0; EXPECT=matched; output-sha256=cacc8f592e72f6d9ab7dfddeaa45bbbda71ba4635191323bb04b18d83403e675; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G2: in the browser, offline the owner's account pages open but changing a password or adding staff says a connection is needed and nothing is queued; a staff device that was offline during that staff member's deactivation is signed out when it reconnects, and the owner then sends that staff member's queued sale from the same device
  CHECK: node scripts/gates/require-tests.mjs playwright --ids ACCOUNT-ONLINE-ONLY,FR-045-RECONNECT,FR-036-DEACTIVATED-SEND tests/e2e/sync-accounts
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=0a2297b69c066ccf8477566d53416b191d7e4eec39012781d9d404e0005dc41f; exit=0; EXPECT=matched; output-sha256=d881fa64b629b58a5c3f18df2e7ec470e0adcaf42796bc3d281bddc7bfc6f0a3; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries
