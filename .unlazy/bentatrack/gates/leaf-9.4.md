# Gates: leaf 9.4 Product, category, and supplier changes offline

OWNS: src/lib/offline/outbox.ts, src/lib/offline/sync.ts, src/lib/commands.ts, src/app/api/sync/**, src/components/sync/**, src/features/products/**, src/features/categories/**, src/features/suppliers/**, src/lib/storage.ts, prisma/schema.prisma, prisma/migrations/**, tests/unit/sync-catalog/**, tests/integration/sync-catalog/**, tests/e2e/sync-catalog/**

Scope: Adding and editing products (including a stock correction and a new image), archiving and restoring, and adding, renaming, or deleting categories and suppliers all work offline. Each is queued in the outbox with a client-generated id, applied to the device store at once, and sent in the order made. So a category created offline, then a product in it, then an edit to that product, all sync correctly. The server applies each one idempotently with the same permission and validation rules as online. Images wait on the device until sync. A refused change (duplicate code or barcode, category still in use, edit of an archived product, stock changed meanwhile) stays on the device with its reason and can be retried or discarded. The "Waiting to sync" list and pending count cover every kind of change.

SRS: v2.1 FR-034, FR-035, FR-036, FR-049, FR-053, FR-051, FR-001–FR-004, FR-003 (stock conflict), FR-041–FR-043, FR-057–FR-059, FR-032 (staff limits), FR-054

Notes:
- Product, Category, and Supplier ids must accept client-generated UUIDs (Interfaces "IDs", contract rev 5); a schema change is only needed if the current cuid defaults reject them.
- Takes ownership of the outbox and sync files from leaves 6.2 and 9.3 and of the product, category, and supplier features from leaf 9.2 (plan amendment logged when this leaf starts).

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-9.4.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-9.4.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=dd9f432bf8d15e424e45c191e6f9a6e46a4e7c6e1562c7675fb8244741528770; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G1: every product, category, and supplier change is queued offline, survives reloads, replays in order without double-applying, keeps refused changes with their reason, and staff cannot queue owner-only changes
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-034-CATALOG,FR-036-CATALOG,FR-049-ORDER,FR-053-CATALOG,FR-032-OFFLINE tests/unit/sync-catalog tests/integration/sync-catalog
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=612c6fd8d606684cc50fe8d7d430b4cb0dd35526e91d367506ce713564ddf442; exit=0; EXPECT=matched; output-sha256=216d660463371caea95e084a5310c25fdc49b6c9a8f7abb79d3d13a19514be14; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G2: in the browser while offline, the owner adds a category and a product with an image, edits and archives another product, and everything syncs on reconnect; a duplicate code is shown as refused and can be discarded
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-034-CATALOG,FR-053-CATALOG,PRODUCT-IMAGE-OFFLINE tests/e2e/sync-catalog
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=92aa635a93696cc90e677b355b302c6e9c01347bdfd2039c400bb1abe7b04a2a; exit=0; EXPECT=matched; output-sha256=c3c80d3c1e590d4edbcea6f817f00ae2064589db6b868244e1aa75eadc0051e6; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries
