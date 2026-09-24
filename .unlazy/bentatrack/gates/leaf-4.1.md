# Gates: leaf 4.1 Checkout

OWNS: src/features/sales/**, src/app/(app)/checkout/**, tests/unit/sales/**, tests/integration/sales/**, tests/e2e/checkout/**

Scope: Multi-item sale with quantities, whole-sale discount (amount or percent), Cash/GCash, optional customer text, atomic stock deduction with SALE history, idempotent by client id, and low-stock popups.

SRS: §4.5 FR-013–020; FR-005, FR-008, FR-012; amendments A1, A4, B8, B9; Figure 1

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-4.1.md`

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-4.1.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: sale rules: records items, prices, time, staff, customer, discount capped at subtotal, Cash/GCash only, deducts stock atomically, logs SALE, idempotent, rejects overselling online
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-005,FR-012-SALE,FR-013,FR-014,FR-015,FR-016,FR-017,FR-017-CAP,FR-018,FR-019,SALE-ATOMIC,SALE-IDEMPOTENT,SALE-OVERSELL tests/unit/sales tests/integration/sales
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G2: in the browser: full checkout updates stock immediately and pops a low-stock alert when a product crosses its threshold
  CHECK: node scripts/gates/require-tests.mjs playwright --ids CHECKOUT-FLOW,NFR-STOCK-IMMEDIATE,FR-008 tests/e2e/checkout
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending
