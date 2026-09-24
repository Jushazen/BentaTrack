# Gates: leaf 4.1 Checkout

OWNS: src/features/sales/**, src/app/(app)/checkout/**, tests/unit/sales/**, tests/integration/sales/**, tests/e2e/checkout/**

Scope: Multi-item sale with quantities, whole-sale discount (amount or percent), Cash/GCash, optional customer text, atomic stock deduction with SALE history, idempotent by client id, and low-stock popups.

SRS: §4.5 FR-013–020; FR-005, FR-008, FR-012; amendments A1, A4, B8, B9; Figure 1

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-4.1.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-4.1.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=047c887a833efc2d9fd90e49fb3060850c84f45d11d685639f88dde1260103bc; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G1: sale rules: records items, prices, time, staff, customer, discount capped at subtotal, Cash/GCash only, deducts stock atomically, logs SALE, idempotent, rejects overselling online
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-005,FR-012-SALE,FR-013,FR-014,FR-015,FR-016,FR-017,FR-017-CAP,FR-018,FR-019,SALE-ATOMIC,SALE-IDEMPOTENT,SALE-OVERSELL tests/unit/sales tests/integration/sales
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=4d5830e732c5becb64c96637ebcd430f40f3c7358aa30dd2834a532820761ce7; exit=0; EXPECT=matched; output-sha256=d468e6da5eafa9847ff841cda69a995fa08e3ba84dcc83a8591cdc1ee4f6ced0; output-bytes=41; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G2: in the browser: full checkout updates stock immediately and pops a low-stock alert when a product crosses its threshold
  CHECK: node scripts/gates/require-tests.mjs playwright --ids CHECKOUT-FLOW,NFR-STOCK-IMMEDIATE,FR-008 tests/e2e/checkout
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=8857edac84a5673b4a4a5dfef44605fabdb998e802c822b8ab87dfe88c728921; exit=0; EXPECT=matched; output-sha256=e605c2280daa06d66cb10a956c55d25979667e2cbe2bcd8af7e5f9d7be674d10; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries
