# Gates: branch 6 Offline integration

Scope: integrate children leaf-6.1, leaf-6.2 into one verified result

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/node-6.md`

- [x] N0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/node-6.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=97ba5d0f274b7e216d982792057d27a7c3ca418baa453aadb8a650ec1b33ed96; exit=0; EXPECT=matched; output-sha256=21ff6d97d7a8f76f9a95533066711bfee4aa6e682d669a61cacb7212acd1faca; output-bytes=176; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N1: every direct child is reverified from its exact ledger
  CHECK: node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 --reverify --jobs 1 .unlazy/bentatrack/gates/leaf-6.1.md .unlazy/bentatrack/gates/leaf-6.2.md
  EXPECT: ALL MET
  EVIDENCE: automatic-evidence=v1; definition-sha256=744e5240ca436f3eeb404c21f3a2bcb9a8a42e39f724d5cda4c8504c81ffd5e1; exit=0; EXPECT=matched; output-sha256=43503acba76ffe796c51f734dc6f29047e9dd41ab61e30b513ce6ecf5166a226; output-bytes=7088; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N2: the joined code type-checks, lints clean, and builds
  CHECK: npm run typecheck && npm run lint && npm run build && node -e "console.log('QUALITY OK')"
  EXPECT: QUALITY OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=cf10060a120dfb09d62495d186862f868462da37dc88a601e099352b2a5748de; exit=0; EXPECT=matched; output-sha256=c250fc364736a1b3999e2afded41f82a27d76412cd032e61d7d81dc4ccadbda7; output-bytes=1772; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N3: no unit or integration test anywhere has regressed
  CHECK: npm test
  EXPECT: /Tests\s+\d+ passed \(\d+\)/
  EVIDENCE: automatic-evidence=v1; definition-sha256=c272898e03882393443af772473570173cc4e8b77ab99d2b0c80e22ad3b67b38; exit=0; EXPECT=matched; output-sha256=4d42d5e588cfc7b781327e1e3534d9cca698051eb05cfd19b778856db2541cbe; output-bytes=266; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N4: no end-to-end test anywhere has regressed on desktop or phone
  CHECK: npx playwright test
  EXPECT: /\d+ passed/
  EVIDENCE: automatic-evidence=v1; definition-sha256=7ce48e19e1b26a3799347f24c60626cfc78087636ceedb617fe004283c250e18; exit=0; EXPECT=matched; output-sha256=c23b266dacc0cfe0efbb6c1a3aa4f3bb73cc049c8164fc50e53c441516b31091; output-bytes=15769; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N5: the children's manual gates were reviewed at branch level
  EVIDENCE: 2026-09-27: none to review; leaf-6.1 (3/3) and leaf-6.2 (3/3) gates are all runnable CHECKs, all met via N1
