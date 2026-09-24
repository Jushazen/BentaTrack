# Gates: branch 3 Inventory integration

Scope: integrate children leaf-3.1, leaf-3.3, leaf-3.2, leaf-3.4, leaf-3.5 into one verified result

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/node-3.md`

- [x] N0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/node-3.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=2b46d8ff8475bb2ceb79a183caf0536c64c170698a1ab83accb7cbf68bf8d831; exit=0; EXPECT=matched; output-sha256=c353441ed65ab6313fc02f51c5ffe30af74c55a143b5b2c05dbc0e88f962eb80; output-bytes=176; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N1: every direct child is reverified from its exact ledger
  CHECK: node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 --reverify --jobs 1 .unlazy/bentatrack/gates/leaf-3.1.md .unlazy/bentatrack/gates/leaf-3.3.md .unlazy/bentatrack/gates/leaf-3.2.md .unlazy/bentatrack/gates/leaf-3.4.md .unlazy/bentatrack/gates/leaf-3.5.md
  EXPECT: ALL MET
  EVIDENCE: automatic-evidence=v1; definition-sha256=100aedd6a667875cce9169e9ab4d95270091755c00ad1ddbaadc498d279e908e; exit=0; EXPECT=matched; output-sha256=d9383450f108a2037a05731ae9ece5b03b9a0c6c5460abf34481b0bcabe83d75; output-bytes=17110; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N2: the joined code type-checks, lints clean, and builds
  CHECK: npm run typecheck && npm run lint && npm run build && node -e "console.log('QUALITY OK')"
  EXPECT: QUALITY OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=cf10060a120dfb09d62495d186862f868462da37dc88a601e099352b2a5748de; exit=0; EXPECT=matched; output-sha256=10b09ef850ca95db27ce9b019ba3415583990d24946394f6d14d4f08b2477367; output-bytes=1297; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N3: no unit or integration test anywhere has regressed
  CHECK: npm test
  EXPECT: /Tests\s+\d+ passed \(\d+\)/
  EVIDENCE: automatic-evidence=v1; definition-sha256=c272898e03882393443af772473570173cc4e8b77ab99d2b0c80e22ad3b67b38; exit=0; EXPECT=matched; output-sha256=30ba5116f269c88a8366d5107e5b64cd2ffff1666180058d3b71bf2d8ced4e8d; output-bytes=264; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N4: no end-to-end test anywhere has regressed on desktop or phone
  CHECK: npx playwright test
  EXPECT: /\d+ passed/
  EVIDENCE: automatic-evidence=v1; definition-sha256=7ce48e19e1b26a3799347f24c60626cfc78087636ceedb617fe004283c250e18; exit=0; EXPECT=matched; output-sha256=f169cc877502ed8d4b732d83b4f5ac7e5350932a3fea2da93380cf12c91603e3; output-bytes=10129; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [ ] N5: the children's manual gates were reviewed at branch level
  EVIDENCE: pending
