# Gates: leaf 3.1 App shell and design system

OWNS: src/app/layout.tsx, src/app/page.tsx, src/app/globals.css, src/app/(app)/layout.tsx, src/components/layout/**, src/components/ui/**, public/brand/**, tests/e2e/shell/**, tests/unit/shell/**

Scope: Responsive signed-in shell: role-aware navigation with text+icon labels, light/dark theme, white/brown palette, Estetika wordmark, toaster, and the shared low-stock alert component.

SRS: §2.5, §3.1 design requirements, §5.4; FR-007; amendment D3 (placeholder logo)

Notes:
- Use the tastemaker skill for the visual design pass.
- Low-stock alert contract: see PLAN contract 'Low-stock alerts'.

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-3.1.md`

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-3.1.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: every button and link shows visible text, theme toggle persists, wordmark shows, nav hides owner-only items from staff, low stock is announced on open
  CHECK: node scripts/gates/require-tests.mjs playwright --ids UI-LABELS,UI-THEME,UI-LOGO,UI-NAV-ROLE,FR-007 tests/e2e/shell
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G2: owner or team approves the look (white/brown, simple, business-appropriate) from desktop and phone screenshots in both themes
  EVIDENCE: pending
