# Gates: branch 8 Change requests 2026-10-01 integration

Scope: integrate children leaf-8.1, leaf-8.2, leaf-8.3, leaf-8.4 into one verified result

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/node-8.md`

- [x] N0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/node-8.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=637f66f9fac3051e4a276e1d67bc336f15a209b8615146d0ace2ab088c38d615; exit=0; EXPECT=matched; output-sha256=989c04b68ddb19c09603772e91b9344afe791edc661361b767cdc105426ca5d4; output-bytes=176; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] N1: every direct child is reverified from its exact ledger
  CHECK: node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 --reverify --jobs 1 .unlazy/bentatrack/gates/leaf-8.1.md .unlazy/bentatrack/gates/leaf-8.2.md .unlazy/bentatrack/gates/leaf-8.3.md .unlazy/bentatrack/gates/leaf-8.4.md
  EXPECT: ALL MET
  EVIDENCE: automatic-evidence=v1; definition-sha256=8a36ec74904e4a7f697c0d0053cfba59beac5be7cb25ff550aca456e17cada80; exit=0; EXPECT=matched; output-sha256=d14c37f9d450688e85e65171124b8374f047d63fdc239107cb092c99c88d9e6e; output-bytes=19764; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] N2: the joined code type-checks, lints clean, and builds
  CHECK: npm run typecheck && npm run lint && npm run build && node -e "console.log('QUALITY OK')"
  EXPECT: QUALITY OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=cf10060a120dfb09d62495d186862f868462da37dc88a601e099352b2a5748de; exit=0; EXPECT=matched; output-sha256=3099ef1706a49aa4c30cc5e3e6ba735b67690301dd03669d081b7447e824c550; output-bytes=1829; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] N3: no unit or integration test anywhere has regressed
  CHECK: npm test
  EXPECT: /Tests\s+\d+ passed \(\d+\)/
  EVIDENCE: automatic-evidence=v1; definition-sha256=c272898e03882393443af772473570173cc4e8b77ab99d2b0c80e22ad3b67b38; exit=0; EXPECT=matched; output-sha256=3a9fb76765cf777d9d61c43b98118eb64b1a0bc6596d40dab4875ee0219bb6e6; output-bytes=266; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] N4: no end-to-end test anywhere has regressed on desktop or phone
  CHECK: npx playwright test
  EXPECT: /\d+ passed/
  EVIDENCE: automatic-evidence=v1; definition-sha256=7ce48e19e1b26a3799347f24c60626cfc78087636ceedb617fe004283c250e18; exit=0; EXPECT=matched; output-sha256=f606b52ae61b7fcab1dde9339e42ef334249012e96a20721561c27b13642651f; output-bytes=22041; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] N5: the children's manual gates were reviewed at branch level
  EVIDENCE: 2026-10-03: one manual gate in the branch, leaf-8.2:G3 (real-device standalone install), confirmed by user (Jushazen) 2026-10-03 (installed app has its own icon and opens standalone; specific Android/iPhone devices not stated); every other gate of leaf-8.1 (5/5), leaf-8.2 (3/4 runnable), leaf-8.3 (5/5), leaf-8.4 (4/4) is a runnable CHECK, all met via N1
