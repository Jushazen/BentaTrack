# Gates: branch 9 Everything works offline (SRS v2.1 FR-049) integration

Scope: integrate children leaf-9.1, leaf-9.2, leaf-9.3, leaf-9.4, leaf-9.5, leaf-9.6, leaf-9.7 into one verified result

Run: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 .unlazy/bentatrack/gates/node-9.md`

- [x] N0: this ledger states outcomes that can fail
  CHECK: node .claude/skills/unlazy/scripts/gate-lint.mjs .unlazy/bentatrack/gates/node-9.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=d902499081b471096048880a9206c8d48ab2e9e6f50da22a29353ae672d4c8ec; exit=0; EXPECT=matched; output-sha256=fd4d5486afba72ad8bcb965bc7d8a9922389059740aa07f824c5cba19286f110; output-bytes=355; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] N1: every direct child is reverified from its exact ledger
  CHECK: node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 3600 --reverify --jobs 1 .unlazy/bentatrack/gates/leaf-9.1.md .unlazy/bentatrack/gates/leaf-9.2.md .unlazy/bentatrack/gates/leaf-9.3.md .unlazy/bentatrack/gates/leaf-9.4.md .unlazy/bentatrack/gates/leaf-9.5.md .unlazy/bentatrack/gates/leaf-9.6.md .unlazy/bentatrack/gates/leaf-9.7.md
  EXPECT: ALL MET
  EVIDENCE: automatic-evidence=v1; definition-sha256=3502a466c0bd6d8cd74deea13f394c0f5a7a2b8b50ac9379c8accf25f73d3ba5; exit=0; EXPECT=matched; output-sha256=fad5add6312eec5110ed6aaf4bbada539b7c2d0901a73094692cecd75b6247cf; output-bytes=30064; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] N2: the joined code type-checks, lints clean, and builds
  CHECK: npm run typecheck && npm run lint && npm run build && node -e "console.log('QUALITY OK')"
  EXPECT: QUALITY OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=cf10060a120dfb09d62495d186862f868462da37dc88a601e099352b2a5748de; exit=0; EXPECT=matched; output-sha256=ddd1fe0d43f55323667eaecba1fd300b65a153c8a45eb9202781b17c789fc9c8; output-bytes=1830; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [x] N3: no unit or integration test anywhere has regressed
  CHECK: npm test
  EXPECT: /Tests\s+\d+ passed \(\d+\)/
  EVIDENCE: automatic-evidence=v1; definition-sha256=c272898e03882393443af772473570173cc4e8b77ab99d2b0c80e22ad3b67b38; exit=0; EXPECT=matched; output-sha256=ad0f0d946989dcf96f807b8a2aedf5293e6476f5006d86bdacaf4bf5cef44545; output-bytes=467; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\thomas\Desktop\Projects\BentaTrack; path=ab1555cb0450/55 entries

- [ ] N4: no end-to-end test anywhere has regressed on desktop or phone
  CHECK: npx playwright test
  EXPECT: /\d+ passed/
  EVIDENCE: pending

- [ ] N5: the children's manual gate (leaf-9.6:G3) was reviewed at branch level (leaf-9.5 no longer has one)
  EVIDENCE: pending
