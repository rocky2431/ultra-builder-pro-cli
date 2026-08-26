# Ultra Builder Pro 5.0 implementation checkpoint

## Why

3.0 已经确立正确的 file-first / model-agency constitution，但真实使用中 owner
无法稳定感知跨 Skill 路线、Research exit、Change/Plan 职责和 delegation 进度；
clean npx 安装后的 bare `ubp delegate` 运行边界也已证实不可达。

## Outcome

交付 `docs/ULTRA-BUILDER-PRO-5.0.zh-CN.md` 定义的 Route Contract、Skill 职责、
grant continuation、Skill-local ACP/CLI delegation、ZCode bridge、3.x migration 和
真实 journey acceptance，形成未发布的本地 5.0 release candidate。

## Accepted boundary

- Included: workflow/owner legibility, invocation repair, local multi-Agent execution,
  migration, Doctor, tests, docs, package candidate.
- Excluded: Team Pack, remote shared assets, Marketplace, daemon, semantic state
  machine, commit/push/tag/publish/real install/provider spend。

## Current checkpoint

- Route: `ultra-dev`
- Mode: `execute` task `v50-release-candidate`
- Position: the 5.0.0 product snapshot is frozen after Route, Skill-local delegation,
  ACP drivers, migration journeys, versioned docs, Skill/plugin validation, full release
  gate, dry-run pack, and isolated six-Host Doctor. Task review/evidence and aggregate
  Test remain derived closeout work; no product file should change without rerunning the
  release gate.
- Exit condition: release-task evidence is current-v2, all five Change tasks are
  completed, and one aggregate Test report binds the final candidate and retained strict
  Reviews without performing a release effect.

## Reality

- Verified local package candidate: `5.0.0` at HEAD
  `b684f15d18ead6b5dfe6a1fc621ccc196e95cdd1` (dirty source snapshot; not published).
- Reproduced baseline gap: a clean one-shot install did not persist bare `ubp`, while the
  installed `ultra-delegate` instructed that unreachable command. The current local fix
  instead invokes its installed `scripts/delegate.cjs` path.
- Route Contract focused test: 5/5 passing.
- Six-Host adapter regression: 14/14 passing; unsupported Host bits remain absent.
- Nine changed Skills pass the Skill Creator validator in an isolated `PyYAML` runtime.
- Route task evidence validates as `current-v2`; review verdict is `APPROVE` with no findings.
- Skill-local delegation evidence validates as `current-v2`; 155 focused tests and its
  strict Review pass with no findings.
- ACP driver evidence validates as `current-v2`; 175 focused tests and its strict Review
  pass with no findings. Events are bounded/redacted at write and read, permission
  widening fails closed, and cancellation/timeout leave no POSIX descendant.
- No shipped Host claims passed ACP conformance. ZCode resolves the installed 0.16.5
  runtime, remains experimental, and uses `acp_v1_unavailable` CLI fallback; no provider
  task was started.
- Migration evidence validates as `current-v2`; a real isolated 3.x lifecycle preserved
  eighteen canonical artifacts with the same aggregate digest before update, after
  update, and after uninstall. The focused journey suite is 5/5, the expanded regression
  is 255/255, and its strict Review is `APPROVE` with no findings.
- The canonical journey register reports thirteen local PASS rows and one honest STOP
  for the unactivated ZCode ACP bridge.
- All nine changed Skills pass Skill Creator validation, and an isolated generated Codex
  plugin passes Plugin Creator validation.
- `npm run verify:release` exits zero with 647 Node tests, 89 Hook tests, and zero
  production dependency vulnerabilities at the configured high-severity threshold.
- `npm pack --dry-run --json` reports `ultra-builder-pro-cli@5.0.0`, 138 entries,
  362686 packed bytes, 1307282 unpacked bytes, and shasum
  `421f6a71027b2ebe346224f415aa43416bdb1ba4`; no tarball is written.
- An isolated all-Host install and Doctor report every adapter `healthy`, package
  `5.0.0`, installed delegation runner present, and the exact CLI fallback reason;
  uninstall leaves the isolated root empty. Codex hook trust remains an explicit user
  review action, not an installation failure.

## Decision needed

None. The Owner accepted the 5.0 boundary and Route Card/material-checkpoint default.

## Next bounded action

Complete the release-task strict Review and current-v2 evidence, close its ledger row,
then publish one aggregate Test report and rerun the affected final verification gate.

## Not done

- task Review/evidence and aggregate Test closeout;
- real external drills, package publication, and real user installation;
- live Host ACP conformance, an activated ZCode ACP bridge, and Windows descendant
  process cleanup proof.
