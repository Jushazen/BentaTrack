# Gates: leaf 9.5 Account changes offline and session effects

OWNS: src/lib/offline/outbox.ts, src/lib/offline/sync.ts, src/app/api/sync/**, src/features/users/**, src/features/account/**, src/app/(auth)/session-ended/**, src/lib/auth.ts, src/components/offline/**, tests/unit/sync-accounts/**, tests/integration/sync-accounts/**, tests/e2e/sync-accounts/**

Scope: The owner can create staff accounts, reset staff passwords, deactivate or reactivate accounts, and change their own password while offline. Each is queued and applied on sync. A new or reset password is hashed on the device before it is queued, so it is never stored in plain text. The current password for the owner's own change is checked by the server at sync, and is removed from the device once the entry syncs or is discarded. A wrong current password is refused and kept (FR-053). When a device reconnects, a session ended by deactivation, a staff password reset, or a password change signs out, owner-only data is removed (leaf 9.1), and the user lands on the session-ended page. After the owner's own change syncs, every device signed in to that account is signed out, including the one used.

SRS: v2.1 FR-045, FR-060, FR-046, FR-049, FR-050, FR-053, §5.2

Notes:
- Decided 2026-10-03 (option B): changes a staff member queued on a device before their account was deactivated are not lost. When the owner signs in on that device, they see them listed by person (e.g. "3 changes by Ana, account deactivated") and can send them. The changes are still recorded under the staff member's name (§5.2), not the owner's. The server accepts them only if they were made (FR-054 device time) before the account was deactivated; later ones are refused and kept (FR-053). Staff never see or send another person's queued changes.
- Takes ownership of the outbox and sync files from leaf 9.4 and of src/components/offline/** from leaf 9.1 (plan amendment logged when this leaf starts).

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-9.5.md`

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-9.5.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: account changes and the owner's password change queue offline and apply on sync, a wrong current password is refused and kept, no plain-text password stays on the device, reconnecting devices of a deactivated or reset account are signed out with owner data removed, and the owner can send a deactivated staff member's earlier changes under that staff member's name while later ones are refused
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-045-OFFLINE,FR-045-RECONNECT,FR-060-OFFLINE,FR-060-OFFLINE-WRONG-CURRENT,OFFLINE-NO-PLAINTEXT,FR-036-DEACTIVATED-SEND,FR-036-DEACTIVATED-AFTER tests/unit/sync-accounts tests/integration/sync-accounts
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G2: in the browser, the owner changes their password offline and is signed out after reconnecting; a staff device that was offline during that staff member's deactivation is signed out when it reconnects, and the owner then sends that staff member's queued sale from the same device
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-060-OFFLINE,FR-045-RECONNECT,FR-036-DEACTIVATED-SEND tests/e2e/sync-accounts
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G3: the team leader reviewed how passwords and owner-only data are stored on the device and found no plain-text password or staff-visible owner data
  EVIDENCE: pending
