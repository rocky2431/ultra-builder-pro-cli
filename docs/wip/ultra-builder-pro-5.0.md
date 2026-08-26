# Ultra Builder Pro 5.0 implementation checkpoint

## Why

3.0 已经确立正确的 file-first / model-agency constitution，但真实使用中 owner
无法稳定感知跨 Skill 路线、Research exit、Change/Plan 职责和 delegation 进度；
clean npx 安装后的 bare `ubp delegate` 运行边界也已证实不可达。

## Outcome

交付 `docs/ULTRA-BUILDER-PRO-5.0.zh-CN.md` 定义的 Route Contract、Skill 职责、
grant continuation、Skill-local ACP/CLI delegation、ZCode bridge、3.x migration 和
真实 journey acceptance，并把六 Host ACP、真实 HOME、Windows 与公共发布闭环为
可安装、可恢复、可核验的 5.0 release。

## Accepted boundary

- Included: workflow/owner legibility, invocation repair, six real ACP transports,
  pinned ZCode bridge, migration, real HOME install/Doctor, Windows cleanup, tests,
  commit/push/tag、npm publication 和 GitHub Release。
- Excluded: Team Pack、remote shared assets、daemon、semantic state machine、凭据导出/
  替换、provider 充值、force-push、npm unpublish，以及仓库中不存在的服务部署。

## Current checkpoint

- Route: `ultra-dev`
- Mode: `release` task `v50-public-release`
- Position: 六 Host real ACP、真实 HOME activation 和 Windows descendant cleanup 已完成；
  `origin/main` 的证据提交 `c39fbcd17993` 在 GitHub Actions run `32936156375` 上通过
  Ubuntu/macOS 完整 release gate 与 Windows focused ACP gate。当前正在冻结可 tag 的
  release-source commit，尚未声称 registry 或 GitHub Release 已存在。
- Exit condition: 绿色 release-source commit 被 annotated tag `v5.0.0` 精确引用，trusted
  workflow 完成 npm/GitHub publication，published package 真实安装通过；随后本 task
  发布 strict Review/evidence，九任务 aggregate Test 与 explicit Deliver 完成 archive。

## Reality

- Verified source line: recovery commit `8be6f6d` plus the live ACP/Windows repair chain
  has been pushed through `c39fbcd17993`; the package is not yet tagged or published.
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
- All six profiles expose stable ACP v1 stdio candidates and bind their own current
  passing receipt. A missing executable, protocol mismatch, missing evidence, or forced
  recovery still selects typed CLI fallback.
- Real provider conformance passes for Claude, Codex, OpenCode, Kimi, Grok, and ZCode
  with the exact Ultra result, clean isolated Git, and observed worker termination. Grok
  uses bounded, identity-checked creation-time metadata buffering. ZCode uses ZCode
  Desktop as Host/runtime and the Owner's domestic BigModel Coding Plan as provider.
- Upstream `jpalmae/zcode-acp` tag v0.1.0 resolves to commit
  `42fe149d4b501469343c01f23ba3801832306d53`; it has no release binary assets. Its
  installed-runtime 0.16.5 handshake drift was reproduced RED, then fixed by the shipped
  patch SHA-256 `174dfd0feafe84320556a84b5ae08b10e44c5515fea4992fd1d58af54cee4e3d`.
  `cargo test --locked` completed with 6/6 tests, patched fake app-server E2E passed,
  and the release build was installed at `~/.local/bin/zcode-acp`. The built and installed
  binary reports `zcode-acp 0.1.0+ultra.zcode.0.16.5` and has SHA-256
  `0e9c8fb2827c566c8a623f3a9706715a221ce7a9b1d3eef32c839937c62420dd`;
  both the previous patched binary and original upstream binary remain as explicit
  rollbacks.
- Kimi CLI was upgraded from 0.38.0 to official 1.49.0 after asset verification; the old
  binary is backed up and existing config digests were unchanged.
- ACP/launcher focused verification is 73/73 including installed patch bytes. The last
  complete Node suite reached 656/657 and Hooks are 89/89; the sole red assertion was
  the intentionally stale final
  `.ultra/test-report.json`, which cannot truthfully include the four unfinished live
  activation/release tasks yet.
- GitHub Actions run `32935138736` first proved the implementation commit across Ubuntu,
  macOS, and Windows. Run `32936156375` then reproved the committed Windows evidence
  closeout itself: both Unix release gates and Windows descendant cleanup are green.
- Migration evidence validates as `current-v2`; a real isolated 3.x lifecycle preserved
  eighteen canonical artifacts with the same aggregate digest before update, after
  update, and after uninstall. The focused journey suite is 5/5, the expanded regression
  is 255/255, and its strict Review is `APPROVE` with no findings.
- The canonical journey register now reports fourteen PASS rows; the earlier ZCode STOP
  is superseded by the real domestic-provider receipt and bridge compatibility evidence.
- All nine changed Skills pass Skill Creator validation, and an isolated generated Codex
  plugin passes Plugin Creator validation.
- `npm run verify:release` exits zero with 647 Node tests, 89 Hook tests, and zero
  production dependency vulnerabilities at the configured high-severity threshold.
- The last `npm pack --dry-run --json` reports `ultra-builder-pro-cli@5.0.0` with 141
  files; the exact final pack identity is refreshed on the release-source snapshot and
  no dry-run tarball is written.
- An isolated all-Host install and Doctor report every adapter `healthy`, package
  `5.0.0`, installed delegation runner present, and the exact CLI fallback reason;
  uninstall leaves the isolated root empty. Codex hook trust remains an explicit user
  review action, not an installation failure.
- The real-HOME pre-install recovery point exists at
  `~/.ultra-builder-pro/backups/2026-08-26-pre-5.0`: 22 managed Ultra source/backup
  pairs are byte-identical, the directory is mode `0700`, and its redacted manifest
  binds sidecar semantic hashes without retaining credential values.
- `node bin/install.js --all --global` completed all six real Hosts. Final all-Host
  Doctor is healthy, the six installed provenance manifests report package `5.0.0`,
  and the 12 untransformed Skill-local delegation files have one exact digest across
  source and every Host.
- Six unrelated Host sentinels remain byte- or semantic-identical. The bounded ZCode
  uninstall/reinstall exercise reached the expected degraded absent state and returned
  to healthy without changing `~/.zcode/cli/config.json` bytes or mode `0600`.
- Real-HOME strict Review `v50-real-home-activation-initial-review-v1` is `APPROVE`
  with both axes passing and no P0-P3 findings.

## Decision needed

None. The Owner explicitly expanded the same Change through
`.ultra/decisions/2026-08-26-ultra-5-0-live-activation.md`.

## Next bounded action

Finish the release-source reconciliation, run the complete local release gate and pack
inspection, push the exact commit, and require its three operating-system CI jobs to be
green before creating `v5.0.0`.

## Not done

- tag `v5.0.0`, npm publish, GitHub Release, published-package install and registry proof;
- public-release strict Review/evidence, final nine-task Review/Test, delivery record,
  WIP deletion and Change archive.
