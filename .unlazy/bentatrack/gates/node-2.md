# Gates: branch 2 Data and access integration

Scope: integrate children leaf-2.1, leaf-2.2, leaf-2.3 into one verified result

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/node-2.md`

- [x] N0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/node-2.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=754781919d01f51b836e1613bd164c230378da55134bde5c7ccdd4b86e2bf13a; exit=0; EXPECT=matched; output-sha256=1d14d35c88db4d9c421f3a14162c2462e4ea240c76f8f5e5a417cc116507d344; output-bytes=176; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N1: every direct child is reverified from its exact ledger
  CHECK: node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 --reverify --jobs 1 .unlazy/bentatrack/gates/leaf-2.1.md .unlazy/bentatrack/gates/leaf-2.2.md .unlazy/bentatrack/gates/leaf-2.3.md
  EXPECT: ALL MET
  EVIDENCE: automatic-evidence=v1; definition-sha256=fae7579ec450cc0c1b19a31484aec05ba4b7d16d2294473c2ba697f74ddfa643; exit=0; EXPECT=matched; output-sha256=115ab1d387b1f4c5f0b19d77d780bd0758113866dae78dc1367b7f3da39033ed; output-bytes=15776; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N2: the joined code type-checks, lints clean, and builds
  CHECK: npm run typecheck && npm run lint && npm run build && node -e "console.log('QUALITY OK')"
  EXPECT: QUALITY OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=cf10060a120dfb09d62495d186862f868462da37dc88a601e099352b2a5748de; exit=0; EXPECT=matched; output-sha256=a6a6399c1e1ab5e17847d453b3807a8b17111964896acb9acc132fdff1c7a713; output-bytes=1239; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N3: no unit or integration test anywhere has regressed
  CHECK: npm test
  EXPECT: /Tests\s+\d+ passed \(\d+\)/
  EVIDENCE: automatic-evidence=v1; definition-sha256=c272898e03882393443af772473570173cc4e8b77ab99d2b0c80e22ad3b67b38; exit=0; EXPECT=matched; output-sha256=c8e2a48ea6f1783f64eb64518300486787dbe099068609915dd7b935fc4abac1; output-bytes=262; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N4: no end-to-end test anywhere has regressed on desktop or phone
  CHECK: npx playwright test
  EXPECT: /\d+ passed/
  EVIDENCE: automatic-evidence=v1; definition-sha256=7ce48e19e1b26a3799347f24c60626cfc78087636ceedb617fe004283c250e18; exit=0; EXPECT=matched; output-sha256=e4d4ca065d0f78ac2bb5181f87e776638b62bcbd41c9021e5a4b9325fe8bd135; output-bytes=6895; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N5: the children's manual gates were reviewed at branch level
  EVIDENCE: 2026-09-24: none to review; leaf-2.1 (7/7), leaf-2.2 (4/4), leaf-2.3 (3/3) gates are all runnable CHECKs, all met via N1
