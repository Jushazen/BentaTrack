# Gates: leaf 6.1 PWA shell and offline catalog

OWNS: next.config.ts, src/app/sw.ts, src/app/manifest.ts, src/app/offline/**, src/app/serwist/**, src/lib/offline/db.ts, src/lib/offline/catalog.ts, public/icons/**, tests/unit/offline/**, tests/e2e/offline/**

Scope: Serwist service worker (Turbopack build), web manifest, offline fallback page, Dexie product catalog cache, and offline access for an already signed-in session.

SRS: §2.4, §4.9, §5.3; amendment B10 (FR-050), D2

Notes:
- Read node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md and the @serwist/turbopack docs first.

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-6.1.md`

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-6.1.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: Dexie catalog schema stores and queries products offline
  CHECK: node scripts/gates/require-tests.mjs vitest --ids OFFLINE-DB tests/unit/offline
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending

- [ ] G2: service worker controls the page, manifest is valid, signed-in user can reload checkout and search products while offline
  CHECK: node scripts/gates/require-tests.mjs playwright --ids PWA-SW,PWA-MANIFEST,FR-050,OFFLINE-CATALOG tests/e2e/offline
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: pending
