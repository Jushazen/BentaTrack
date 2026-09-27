# Gates: branch 5 Reporting integration

Scope: integrate children leaf-5.1, leaf-5.2 into one verified result

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/node-5.md`

- [x] N0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/node-5.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=5a97ea367c11083597a024548edeb97dd8c7cfd07d21265a5d0a2d18a33122ac; exit=0; EXPECT=matched; output-sha256=c002d205509f7addf8f1cfd8460ba68e084935fd48ca647f0eca0e764cb3d8d4; output-bytes=176; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N1: every direct child is reverified from its exact ledger
  CHECK: node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 --reverify --jobs 1 .unlazy/bentatrack/gates/leaf-5.1.md .unlazy/bentatrack/gates/leaf-5.2.md
  EXPECT: ALL MET
  EVIDENCE: automatic-evidence=v1; definition-sha256=df80bd7c50ba43892fba173f872c23bf41eadb11b870a4d5b7333f86fbc81f8c; exit=0; EXPECT=matched; output-sha256=06c9686a95cef559ed41005ec036b55e4b76d82277d38f921b1c7e4c1f4fb10d; output-bytes=6835; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N2: the joined code type-checks, lints clean, and builds
  CHECK: npm run typecheck && npm run lint && npm run build && node -e "console.log('QUALITY OK')"
  EXPECT: QUALITY OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=cf10060a120dfb09d62495d186862f868462da37dc88a601e099352b2a5748de; exit=0; EXPECT=matched; output-sha256=813b3460a6b9f16696de45209fbf7a3f78acf148055be833136b27a32caaf613; output-bytes=1369; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N3: no unit or integration test anywhere has regressed
  CHECK: npm test
  EXPECT: /Tests\s+\d+ passed \(\d+\)/
  EVIDENCE: automatic-evidence=v1; definition-sha256=c272898e03882393443af772473570173cc4e8b77ab99d2b0c80e22ad3b67b38; exit=0; EXPECT=matched; output-sha256=7fab20fe6bb2ca7fca078361d42734c02fb0ce4c70d4934250c8c7b614c12a8a; output-bytes=266; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N4: no end-to-end test anywhere has regressed on desktop or phone
  CHECK: npx playwright test
  EXPECT: /\d+ passed/
  EVIDENCE: automatic-evidence=v1; definition-sha256=7ce48e19e1b26a3799347f24c60626cfc78087636ceedb617fe004283c250e18; exit=0; EXPECT=matched; output-sha256=807ad88402b2ee93ac1aacc08dce11102eb638d424fd8b75011df75051edace2; output-bytes=13671; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N5: the children's manual gates were reviewed at branch level
  EVIDENCE: 2026-09-27: none to review; leaf-5.1 (3/3) and leaf-5.2 (3/3) gates are all runnable CHECKs, all met via N1
