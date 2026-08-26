# Ultra Builder Pro 5.0 journey 验收结果 — 2026-08-26

## 结论

14 条已接受 journey 都有可观察结果并全部为 `PASS`。2026-08-25 的初始候选曾把
ZCode ACP promotion 记为诚实 `STOP`；2026-08-26 的 live activation 先复现并修复
ZCode 0.16.5 runtime-preferences handshake，再通过国内 BigModel provider 完成真实
receipt，因此该行已经由新证据取代。之后六 Host real user-HOME install/Doctor、
Windows descendant cleanup 和 same-commit 三平台 CI 也分别完成；公共 registry 与
GitHub Release 仍由最后的 release task 独立验证。

这里的证据分为三类，不能互相冒充：

- `source-contract`：验证 Skill 得到一致、可到达、可停止的导航合同，不断言任一模型的
  实际表达质量；
- `isolated-runtime`：运行真实 installer/Doctor/runner 代码，但只使用临时 config、fake
  Codex registration 或 fake ACP/CLI target；
- `live-provider`：六个 Host 分别完成 one bounded read-only ACP provider session；
  receipt 只保留协议/result/进程/Git 事实和 digest，不保留 prompt 或 provider text。

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
| J8 | Clean install delegation | PASS | isolated install 后从 loaded `ultra-delegate/scripts/delegate.cjs` 直接运行；不依赖 global `ubp`，Doctor 可见 runner；六个真实 Host home 的最终 Doctor 也都选择 ACP | `tests/install.test.cjs`; `tests/package-smoke.test.cjs`; migration fixture；`.ultra/evidence/v50-real-home-activation/` | published-registry consumer install 由 public-release task 验证 |
| J9 | ACP happy path | PASS | stable v1 initialize -> session/new -> bounded derived updates -> exact Ultra terminal result | `tests/acp-driver.test.cjs`; `tests/delegate.test.cjs`; fake ACP agent | synthetic executable protocol evidence，不是 Host/provider conformance |
| J10 | Permission denial | PASS | envelope 内写请求仅 `allow_once`；scope widening 立即拒绝，不能转成 successful Ultra result | `tests/acp-driver.test.cjs`; `tests/delegate.test.cjs` | fake agent；没有真实 provider permission UI |
| J11 | Cancellation | PASS | cancel/timeout 到 typed terminal result，释放 delegation lock，POSIX process group 无 descendant orphan；`windows-latest` 的 cancel 与 timeout 也都终止真实 grandchild，可用 fresh id 重试 | `tests/delegate.test.cjs`; `tests/acp-driver.test.cjs`; GitHub Actions run `32935138736` | 若 Windows `taskkill` 不可用，fallback 只能保证 direct child cleanup |
| J12 | CLI fallback | PASS | 六个 Host 都只在自己的 current receipt、stable ACP v1 和 executable 同时成立时选择 ACP；任一条件缺失仍选择 result-compatible CliDriver，并在 receipt/result/Doctor 显示 typed reason | `tests/acp-driver.test.cjs`; `tests/install.test.cjs`; six live receipts；migration Doctor scenario | provider retry 与 fallback 不自动改变 credential 或语义 authority |
| J13 | ZCode bridge | PASS | installed ZCode 0.16.5 通过 `zcode-acp` v0.1.0 + digest-bound compatibility patch 接入 ACP v1，并用国内 BigModel provider 返回 exact Ultra result、clean Git 与 terminal worker | `skills/ultra-delegate/patches/zcode-acp-0.1.0-zcode-0.16.5.patch`; bridge receipt；`host-zcode.json`; live conformance report | transport maturity 仍为 `experimental`，因为 `app-server` 没有公开稳定性合同；缺 bridge/executable 时仍 typed fallback |
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

## 尚待 public-release task 完成的验证

- 六个真实 Host 对同一 route fixture 的 Route Card 输出质量对比；
- `v5.0.0` annotated tag、npm trusted publication、GitHub Release 与 published-package
  consumer install 的同源性。

六个 live ACP provider receipt、real-HOME activation、Windows cleanup 和三平台 CI
已经完成；剩余 registry/release 缺口属于 public-release task，不会被本报告冒充完成。
