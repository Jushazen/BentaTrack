# Gates: leaf 6.1 PWA shell and offline catalog

OWNS: next.config.ts, src/app/sw.ts, src/app/manifest.ts, src/app/offline/**, src/app/serwist/**, src/lib/offline/db.ts, src/lib/offline/catalog.ts, public/icons/**, tests/unit/offline/**, tests/e2e/offline/**, src/app/api/catalog/**, src/components/offline/**, src/app/layout.tsx, src/app/(app)/layout.tsx, src/features/search/queries.ts, src/features/search/product-search.tsx, src/features/search/product-finder.tsx, src/features/sales/checkout-form.tsx

Scope: Serwist service worker (Turbopack build), web manifest, offline fallback page, Dexie product catalog cache, and offline access for an already signed-in session.

SRS: §2.4, §4.9, §5.3; amendment B10 (FR-050), D2

Notes:
- Read node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md and the @serwist/turbopack docs first.

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-6.1.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-6.1.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=f0c7350249c06e4a60e9a2060e439da1b5ba329654d414c94b53c4aa868ecfa2; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G1: Dexie catalog schema stores and queries products offline, ranked like the server search
  CHECK: node scripts/gates/require-tests.mjs vitest --ids OFFLINE-DB,OFFLINE-SEARCH tests/unit/offline
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=e0efe89bbeff8ec32dde0135ffabefd8327797829132dde228c114b7e358631c; exit=0; EXPECT=matched; output-sha256=096dbd1c1ebbfab7275b2f0fdbd3c63a6aa0700f83a56beee10a806c177f95ed; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] G2: service worker controls the page, manifest is valid, signed-in user can reload checkout and search products while offline, and a different user signing in clears the previous user's cached pages (the catalog holds no costs and is the same for every role, so it is refreshed, not cleared)
  CHECK: node scripts/gates/require-tests.mjs playwright --ids PWA-SW,PWA-MANIFEST,FR-050,OFFLINE-CATALOG,OFFLINE-USER-SWITCH tests/e2e/offline
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=aac870824872221186d4e89d0143164077f02c5da96f6155f6d2e8b2ba2c2df5; exit=0; EXPECT=matched; output-sha256=6f9ecf883a0e438a15949444ee9985db1476ed9ece8413c3cfefd8d1419742d9; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries
