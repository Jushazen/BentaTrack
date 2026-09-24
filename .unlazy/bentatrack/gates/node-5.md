# Gates: branch 5 Reporting integration

Scope: integrate children leaf-5.1, leaf-5.2 into one verified result

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/node-5.md`

- [ ] N0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/node-5.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] N1: every direct child is reverified from its exact ledger
  CHECK: node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 --reverify --jobs 1 .unlazy/bentatrack/gates/leaf-5.1.md .unlazy/bentatrack/gates/leaf-5.2.md
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

- [ ] N5: the children's manual gates were reviewed at branch level
  EVIDENCE: pending
