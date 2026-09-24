# Gates: BentaTrack build (root)

Scope: every SRS V2 requirement (as amended) is built, integrated, and verified, or visibly handed off

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/GATES.md`

- [ ] R0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/GATES.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] R1: setup leaf and every branch are reverified from their exact ledgers
  CHECK: node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 --reverify --jobs 1 GATES.md .unlazy/bentatrack/gates/node-2.md .unlazy/bentatrack/gates/node-3.md .unlazy/bentatrack/gates/node-4.md .unlazy/bentatrack/gates/node-5.md .unlazy/bentatrack/gates/node-6.md .unlazy/bentatrack/gates/node-7.md
  EXPECT: ALL MET
  EVIDENCE: pending

- [ ] R2: every contract inventory row in PLAN.md has a current owner and a met observation, or a visible handoff
  EVIDENCE: pending

- [ ] R3: the finished app was demonstrated to the product owner against SRS §2.1 system flow
  EVIDENCE: pending
