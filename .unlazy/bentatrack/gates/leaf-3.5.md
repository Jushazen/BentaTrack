# Gates: leaf 3.5 Product search and barcode scanning

OWNS: src/features/search/**, src/components/scanner/**, tests/integration/search/**, tests/e2e/search/**, tests/unit/search/**

Scope: Search by name or code, exact barcode lookup, USB/Bluetooth scanner (keyboard) input, and camera scanning limited to 1D barcodes.

SRS: §4.7 FR-026–029; §5.1 search speed; amendment D4

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-3.5.md`

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-3.5.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: search by name, code, and barcode returns correct products; p95 under 500 ms over 5,000 products
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-026,FR-027,FR-028,NFR-PERF-2 tests/integration/search
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G2: camera scanner is configured for 1D barcode formats only (no QR)
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-029 tests/unit/search
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G3: in the browser: name/code search and keyboard-wedge barcode entry open the right product
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-026,FR-027,FR-028-WEDGE tests/e2e/search
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G4: camera scanning reads a real product barcode on an Android phone and an iPhone (device test)
  EVIDENCE: pending
