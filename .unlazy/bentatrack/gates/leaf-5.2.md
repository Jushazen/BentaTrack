# Gates: leaf 5.2 Owner and staff dashboards

OWNS: src/features/dashboard/**, src/app/(app)/dashboard/**, tests/integration/dashboard/**, tests/e2e/dashboard/**

Scope: Owner dashboard (totals, stock, low stock, needs-cost, recent sales, best sellers, today) and a limited staff dashboard.

SRS: §4.6 FR-023–025; amendment A6 (FR-023a), A7 follow-on

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-5.2.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-5.2.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=7829d91327b3b7eb66a38aaab828a04093dfa65a52fce150ea447254e05b889a; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G1: dashboard data matches fixtures for owner and staff, including needs-cost list
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-023,FR-023A,FR-024,FR-025,NEEDS-COST-DASH tests/integration/dashboard
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=db89554f94c729e1d4a4bfe12eee554a180085a39e0cc4797c16dbacecc8164c; exit=0; EXPECT=matched; output-sha256=60df78ac649697c61fd880424f84381dd204ecb6c93f49e2f92e0a908446d047; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G2: both dashboards render the right widgets for each role in the browser
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-023,FR-023A,FR-024,FR-025 tests/e2e/dashboard
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=935746b056dadd606795bc1e16f659c55c6733c04f4edbf309a7ffa8c70191fc; exit=0; EXPECT=matched; output-sha256=4ad8a9fb9c4f2ce0b34f39661754076dcab4fed869b82335698dc2027697dab6; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries
