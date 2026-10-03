# Gates: branch 9 Everything works offline (SRS v2.1 FR-049) integration

Scope: integrate children leaf-9.1, leaf-9.2, leaf-9.3, leaf-9.4, leaf-9.5, leaf-9.6 into one verified result

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/node-9.md`

- [ ] N0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/node-9.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] N1: every direct child is reverified from its exact ledger
  CHECK: node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 --reverify --jobs 1 .unlazy/bentatrack/gates/leaf-9.1.md .unlazy/bentatrack/gates/leaf-9.2.md .unlazy/bentatrack/gates/leaf-9.3.md .unlazy/bentatrack/gates/leaf-9.4.md .unlazy/bentatrack/gates/leaf-9.5.md .unlazy/bentatrack/gates/leaf-9.6.md
  EXPECT: ALL MET
  EVIDENCE: pending

- [ ] N2: the joined code type-checks, lints clean, and builds
  CHECK: npm run typecheck && npm run lint && npm run build && node -e "console.log('QUALITY OK')"
  EXPECT: QUALITY OK
  EVIDENCE: pending

- [ ] N3: no unit or integration test anywhere has regressed
  CHECK: npm test
  EXPECT: /Tests\s+\d+ passed \(\d+\)/
  EVIDENCE: pending

- [ ] N4: no end-to-end test anywhere has regressed on desktop or phone
  CHECK: npx playwright test
  EXPECT: /\d+ passed/
  EVIDENCE: pending

- [ ] N5: the children's manual gates (leaf-9.5:G3, leaf-9.6:G3) were reviewed at branch level
  EVIDENCE: pending
