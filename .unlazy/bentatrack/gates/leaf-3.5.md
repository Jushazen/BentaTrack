# Gates: leaf 3.5 Product search and barcode scanning

OWNS: src/features/search/**, src/components/scanner/**, tests/integration/search/**, tests/e2e/search/**, tests/unit/search/**

Scope: Search by name or code, exact barcode lookup, USB/Bluetooth scanner (keyboard) input, and camera scanning limited to 1D barcodes.

SRS: §4.7 FR-026–029; §5.1 search speed; amendment D4

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-3.5.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-3.5.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=0c38c18b3e80cb65157c1cfa1843df4a400f0da88563888e2cdbfb89ba41c421; exit=0; EXPECT=matched; output-sha256=0a040e5861d1829816505e5010f79271589ae267012d7242067ede3fd4ba9efd; output-bytes=178; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G1: search by name, code, and barcode returns correct products; p95 under 500 ms over 5,000 products
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-026,FR-027,FR-028,NFR-PERF-2 tests/integration/search
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=5b393635ed777578156e19b234c7ae48885f8fcef4419253233bf0aaa4cae3f3; exit=0; EXPECT=matched; output-sha256=25086162f0ac4db24d989984360f66e8d3ed5ab910a965c199790ff434879cec; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G2: camera scanner is configured for 1D barcode formats only (no QR)
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-029 tests/unit/search
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=bdf6c9b1ab642ced96068d8d74cda05adf28da6ba9b5a8b5a731cf97a293f7e3; exit=0; EXPECT=matched; output-sha256=30fd8a8f007c4659c3f2830370c0216d039553f8256051c49903d37f20c90a21; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G3: in the browser: name/code search and keyboard-wedge barcode entry open the right product
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-026,FR-027,FR-028-WEDGE tests/e2e/search
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=c0fa4f5e68ee3ed63fc63ef11ec2928eeeb14fb97dceb659ac5aa89a11d0848f; exit=0; EXPECT=matched; output-sha256=362b594595800571e694f71f1c1b90d684cfae3962129323bd33071dcf5f87ba; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [ ] G4: camera scanning reads a real product barcode on an Android phone and an iPhone (device test)
  EVIDENCE: pending
