# Gates: leaf 5.1 Sales reports

OWNS: src/features/reports/**, src/lib/dates.ts, src/app/(app)/reports/**, src/components/charts/**, tests/unit/reports/**, tests/integration/reports/**, tests/e2e/reports/**

Scope: Daily/weekly/monthly/yearly sales in Asia/Manila with Monday weeks, refunds subtracted on their own date, best sellers, owner-only gross profit, Chart.js charts; staff denied.

SRS: §4.6 FR-021, FR-022; amendment B7 (FR-047, FR-048)

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-5.1.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-5.1.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=bd950d8daed22d49e7b3f623e92444ff17b7a0ea1690a06bc953a0e5c9e0d0ee; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G1: report totals equal independently computed fixture totals across Manila day/week/month/year boundaries; best sellers, profit, and staff denial correct
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-021,FR-021-TZ,FR-022,FR-047,FR-047-NOCOST,REPORTS-STAFF tests/unit/reports tests/integration/reports
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=afef3ccc8973a28ded0406a2aa8642a5e11fcd4ae97ae691c1c4d1621b4f36d6; exit=0; EXPECT=matched; output-sha256=92acc3394b07334a487e885e1f53a59062f0fdb5231f235a24a3a19b6eb266b9; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G2: reports and charts render for the owner in the browser
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-021,FR-022 tests/e2e/reports
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=5c5c4a7aaecab8e823d76f40ea2704e8555824d975b1165656f4be9e7f56ef52; exit=0; EXPECT=matched; output-sha256=35bd54fcb9cc50d2dc64ffa8790fe9a82275238a3b6816c4b68003a0518b2500; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries
