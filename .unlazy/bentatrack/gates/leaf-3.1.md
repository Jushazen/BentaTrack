# Gates: leaf 3.1 App shell and design system

OWNS: src/app/layout.tsx, src/app/page.tsx, src/app/globals.css, src/app/(app)/layout.tsx, src/components/layout/**, src/components/ui/**, public/brand/**, .tastemaker/**, docs/design/**, src/app/(auth)/login/**, src/app/(auth)/forbidden/**, tests/e2e/shell/**, tests/unit/shell/**

Scope: Responsive signed-in shell: role-aware navigation with text+icon labels, light/dark theme, white/brown palette, Estetika wordmark, toaster, and the shared low-stock alert component.

SRS: §2.5, §3.1 design requirements, §5.4; FR-007; amendment D3 (placeholder logo)

Notes:
- Use the tastemaker skill for the visual design pass.
- Low-stock alert contract: see PLAN contract 'Low-stock alerts'.

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-3.1.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-3.1.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=54a30658afc0ff2cf0feccd6736c05c64da1187430f543ecb04ef0662dc1665a; exit=0; EXPECT=matched; output-sha256=2f0fc21e8083b29d8fae304c7af0c82a559f3b777f6dddad4f2998cb9478bf8e; output-bytes=178; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G1: every button and link shows visible text, theme toggle persists, wordmark shows, nav hides owner-only items from staff, low stock is announced on open
  CHECK: node scripts/gates/require-tests.mjs playwright --ids UI-LABELS,UI-THEME,UI-LOGO,UI-NAV-ROLE,FR-007 tests/e2e/shell
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=69acdc618f1efe2427fa5a5a2f9a3edbc9fe4efd939e2776713b3d241df85bac; exit=0; EXPECT=matched; output-sha256=8ca31cb3755bcf5c4723801fa555f8faee0f23c8e4063e1aa24016db18a0831c; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G2: owner or team approves the look (white/brown, simple, business-appropriate) from desktop and phone screenshots in both themes
  EVIDENCE: manual review 2026-09-24: team leader (Manuel Thomas Medina) approved leaf 3.1 after reviewing docs/design/3.1/ screenshots (desktop + phone, light + dark)
