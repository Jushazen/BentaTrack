# Gates: branch 4 Sales integration

Scope: integrate children leaf-4.1, leaf-4.2 into one verified result

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/node-4.md`

- [x] N0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/node-4.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=dfb09746d35a3579906825779ca02615e59dd4d4b2a22fef5d318f54ff7af64a; exit=0; EXPECT=matched; output-sha256=2eb7035d5492793c13c185011357a400f8069ec2539a0a159e7f7ae91554117b; output-bytes=176; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N1: every direct child is reverified from its exact ledger
  CHECK: node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 --reverify --jobs 1 .unlazy/bentatrack/gates/leaf-4.1.md .unlazy/bentatrack/gates/leaf-4.2.md
  EXPECT: ALL MET
  EVIDENCE: automatic-evidence=v1; definition-sha256=917337ab91d445228b56a639da30f86cd6935e20c5ffa8cea92e7448a31f5ea9; exit=0; EXPECT=matched; output-sha256=fc1c40205fc7ed6cb5c57787ab51f9db01b0d809907ceb33b5bb86c2241950e1; output-bytes=6924; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N2: the joined code type-checks, lints clean, and builds
  CHECK: npm run typecheck && npm run lint && npm run build && node -e "console.log('QUALITY OK')"
  EXPECT: QUALITY OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=cf10060a120dfb09d62495d186862f868462da37dc88a601e099352b2a5748de; exit=0; EXPECT=matched; output-sha256=d5a9b8e353dc24894eb5f8a33d4a2b88d6beb2c01060377b9a946728feca1b37; output-bytes=1369; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N3: no unit or integration test anywhere has regressed
  CHECK: npm test
  EXPECT: /Tests\s+\d+ passed \(\d+\)/
  EVIDENCE: automatic-evidence=v1; definition-sha256=c272898e03882393443af772473570173cc4e8b77ab99d2b0c80e22ad3b67b38; exit=0; EXPECT=matched; output-sha256=660a4d4ca75dc17d36b4aa4d7d487f956e1f0113931adee57a976b7922d40846; output-bytes=265; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N4: no end-to-end test anywhere has regressed on desktop or phone
  CHECK: npx playwright test
  EXPECT: /\d+ passed/
  EVIDENCE: automatic-evidence=v1; definition-sha256=7ce48e19e1b26a3799347f24c60626cfc78087636ceedb617fe004283c250e18; exit=0; EXPECT=matched; output-sha256=ae586d838ef645adce4319d3426c656aae69dbaa875948189901d85267e4bc9e; output-bytes=11708; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=4975bd8b17bb/56 entries

- [x] N5: the children's manual gates were reviewed at branch level
  EVIDENCE: 2026-09-26: none to review; leaf-4.1 (3/3) and leaf-4.2 (3/3) gates are all runnable CHECKs, all met via N1
