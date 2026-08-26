# Ultra Builder Pro 5.0 journey 验收结果 — 2026-08-25

## 结论

14 条已接受 journey 均有一个可观察的本地成功或停止点：13 条为 `PASS`，ZCode 的
ACP promotion 为诚实的 `STOP`。`STOP` 不是“永远进行中”；它说明当前事实、未通过的
bar 与最便宜的下一次 drill。No live provider or user-HOME execution was performed.

这里的证据分为三类，不能互相冒充：

- `source-contract`：验证 Skill 得到一致、可到达、可停止的导航合同，不断言任一模型的
  实际表达质量；
- `isolated-runtime`：运行真实 installer/Doctor/runner 代码，但只使用临时 config、fake
  Codex registration 或 fake ACP/CLI target；
- `live-provider`：本轮未授权，因此没有执行，也没有被写成绿色。

## Journey register

| ID | Journey | Result | Observable success or stop | Executed evidence | Deliberate gap |
|---|---|---|---|---|---|
| J1 | Greenfield | PASS | `init/create` 停在 raw brief，`research/baseline` 以 selected coverage 与 stop condition 产出 accepted baseline，再推荐首个 Change | `tests/route-contract.test.cjs`; `docs/evals/ultra-5-0-route-journeys.md#j1--greenfield-baseline` | source-contract；六 Host live output 未跑 |
| J2 | Existing project | PASS | 新请求先进入 Change；有界证据问题经 change-scoped Research 回到同一 `change_id`，accepted 后才进入 Plan | `tests/route-contract.test.cjs`; route journey J2 | source-contract；不把模型语义质量机械化 |
| J3 | Micro edit | PASS | 不使 specification 失真的 edit 明确退出 Change lifecycle，使用 ordinary repository TDD/verification | `skills/ultra-change/SKILL.md`; `docs/WORKFLOW-LIFECYCLE.md#change-reconciliation` | source inspection；实际 edit 由调用项目验证 |
| J4 | Owner revision | PASS | draft 原地修订；accepted consequential answer 以 `supersedes` record 保留旧 authority；拒绝现有选项不会默认进入 Plan | route journey J3；`skills/ultra-change/SKILL.md`; `skills/ultra-status/SKILL.md` | source-contract；owner judgment 不由 fixture 代替 |
| J5 | Fresh session | PASS | 从 root/HEAD、唯一 active Change、matching ledger/context/Resume、baseline 与 Git 重建 Route Card，不重跑已完成 Research | `tests/ultra-5-journeys.test.cjs`; README；`docs/WORKFLOW-LIFECYCLE.md#interruption-and-cross-host-continuation` | 本地 artifact route；本轮未做六 Host live output 对比 |
| J6 | Early value | PASS | Plan 的第一个 slice 必须穿过真实 consumer 与 data path，并命名 owner-visible observation | `tests/ultra-5-journeys.test.cjs`; `skills/ultra-plan/SKILL.md`; lifecycle | source-contract；真实产品 observation 由调用项目提供 |
| J7 | Degraded state | PASS | 两个 active Change 产生 `active_change_ambiguous`；不读任一 intent body，不写 progress，并给出显式保留/archive/abandon/retry 路径 | `tests/ultra-5-journeys.test.cjs` 真实 SessionStart Hook scenario；Status/Review source | Review 在 ambiguity 时停在 packet write 前；不会制造 current scope |
| J8 | Clean install delegation | PASS | isolated install 后从 loaded `ultra-delegate/scripts/delegate.cjs` 直接运行；不依赖 global `ubp`，Doctor 可见 runner | `tests/install.test.cjs`; `tests/package-smoke.test.cjs`; migration fixture | 使用临时 config 与 fake native registration，不是 user-HOME install |
| J9 | ACP happy path | PASS | stable v1 initialize -> session/new -> bounded derived updates -> exact Ultra terminal result | `tests/acp-driver.test.cjs`; `tests/delegate.test.cjs`; fake ACP agent | synthetic executable protocol evidence，不是 Host/provider conformance |
| J10 | Permission denial | PASS | envelope 内写请求仅 `allow_once`；scope widening 立即拒绝，不能转成 successful Ultra result | `tests/acp-driver.test.cjs`; `tests/delegate.test.cjs` | fake agent；没有真实 provider permission UI |
| J11 | Cancellation | PASS | cancel/timeout 到 typed terminal result，释放 delegation lock，POSIX process group 无 descendant orphan，可用 fresh id 重试 | `tests/delegate.test.cjs`; `tests/acp-driver.test.cjs` | Windows descendant cleanup is not proven |
| J12 | CLI fallback | PASS | 每个 Host 独立探测 ACP；未通过 exact row 时选择 result-compatible CliDriver，并在 receipt/result/Doctor 显示 reason | `tests/acp-driver.test.cjs`; `tests/install.test.cjs`; migration Doctor scenario | all shipped Hosts remain on CLI fallback pending per-Host provider evidence |
| J13 | ZCode bridge | STOP | installed ZCode runtime 被探测并只作为 experimental CLI thin transport；ACP v1 不可用，因此 `acp_v1_unavailable`，maturity 不提升 | `skills/ultra-delegate/scripts/host-profile.cjs`; Doctor scenario；ZCode 0.16.5 local binary inspection | ZCode installed-runtime ACP bridge was not promoted；需先实现或确认 ACP v1 seam，再获 owner 授权跑 read-only、permission、cancel/no-orphan、cwd/diff、result 与 redaction drill |
| J14 | 3.x migration | PASS | 18 个 seeded project-owned files（覆盖 baseline、spec、active/archive Change、decision、task/context、Research、evidence、test report 与 binary bytes）在 install -> update -> Doctor -> uninstall 前后 mode、length 与 SHA-256 全相同；六 Host Doctor healthy 且显示 driver health | `tests/ultra-5-journeys.test.cjs` before/after digest 与 Doctor diagnostic | fixture 证明 updater 的真实文件边界，不声称覆盖未知第三方 artifact 语义 |

## 可复现命令

```bash
node --test tests/ultra-5-journeys.test.cjs \
  tests/route-contract.test.cjs \
  tests/acp-driver.test.cjs \
  tests/delegate.test.cjs \
  tests/install.test.cjs \
  tests/package-smoke.test.cjs
```

其中 migration case 会在临时目录执行六 Host install、第二次 install（update）、JSON
Doctor 与 uninstall，并在 TAP diagnostic 中打印 canonical before/update/uninstall digest
和每个 Host 的 selected driver/fallback reason。

## 仍需外部授权的验证

- 六个真实 Host 对同一 route fixture 的 Route Card 输出质量对比；
- Kimi/Grok 等候选 ACP endpoint 的 credentialed provider conformance；
- ZCode ACP bridge 的真实 read-only、permission、cancel/no-orphan 与 bounded-write drill；
- Windows process-tree descendant cleanup proof；
- real user-HOME install、commit、push、tag、npm publish 或 GitHub Release。

这些缺口是明确的外部 acceptance boundary，不会阻塞本地 5.0 package candidate 的
结构、isolated lifecycle 和 synthetic transport 验证，也不会被本报告冒充为完成。
