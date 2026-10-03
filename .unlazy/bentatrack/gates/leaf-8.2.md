# Gates: leaf 8.2 Standalone app install

OWNS: src/components/install/**, tests/e2e/install/**, tests/unit/install/**, src/app/manifest.ts, src/app/layout.tsx, src/components/layout/app-shell.tsx, public/icons/**

Scope: The app installs to a phone's home screen with its own icon and name and opens full-screen without browser bars. An "Install app" button appears where the browser supports it (Android, desktop Chrome); iPhone/iPad users see the Safari "Share → Add to Home Screen" steps. Neither shows once the app is running installed.

SRS: amendments H3 (FR-061, §2.5), F9

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/leaf-8.2.md`

- [x] G0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/leaf-8.2.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=9648de676fa05242bdf80979823261416598cc77db9a3f28231df8d360ccb794; exit=0; EXPECT=matched; output-sha256=6a594d82848a10046c6ca93185be9c260263e70d8a611e952943b9bbe9b02193; output-bytes=178; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G1: the manifest and page metadata meet standalone install requirements (display, icons incl. maskable and Apple touch icon, start URL, theme colours)
  CHECK: node scripts/gates/require-tests.mjs vitest --ids FR-061-MANIFEST tests/unit/install
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=9af5c33afb2c4abbed14d84f4135c530ec4828feb6227d629c1b9a3767737acb; exit=0; EXPECT=matched; output-sha256=8eaec21a386112692c122bef9bac88aaeec61bebb13f9abbb8b7c577f2eb3a20; output-bytes=39; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G2: the install button appears when the browser offers install, iPhone steps appear on iOS Safari, and neither appears in standalone mode
  CHECK: node scripts/gates/require-tests.mjs playwright --ids FR-061 tests/e2e/install
  EXPECT: REQUIRED TESTS PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=83feeb6b92a82b6fb57ae1f3634189bbbba06bff410beb8253794645c60c81f7; exit=0; EXPECT=matched; output-sha256=da7d4fe832f5cc12c8ce17a5e954bb7a52ff1e6146e7bffc466ae91f008515e7; output-bytes=40; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] G3: on a real Android phone and a real iPhone, the installed app has its icon and opens with no browser bars (manual; needs the HTTPS deployment or a tunnel)
  EVIDENCE: manual review 2026-10-03: user (Jushazen) confirmed 8.2 with installable apps (installed app has its own icon and opens standalone); specific devices not stated
