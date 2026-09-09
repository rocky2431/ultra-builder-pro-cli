# Stage B — ZCode entry fixture 隔离修复交接

日期：2026-09-06 · 作者：ZCode（delegation `429a17e064c5414faa39bdfaba32ed1c`，depth 1，chain codex→zcode）
状态：**作者已完成，待 Codex 审查与单独 commit。**

## 任务与授权

按 Root 派发（`work/owner-factory-implementation-20260905/stage-b-zcode-entry-fixture-isolation-mission.md`）：仅修正
`tests/acpx-entry.test.cjs` 的临时 fixture 路径隔离并撰写本交接；日志仅写入
`.ultra/.runtime/owner-factory-implementation-20260905/stage-b-entry-fixture-*`。其余实现只读；
不 commit、不安装、不改 provider profile、不改生产 provenance 代码、不跑真实 Host qualification、
不重建或修改 entry/生产 driver。Operator ceiling 1800 s（操作员上限，非 Owner 数值授权）。

## RED 证据（Root 保留，未改动）

- 完整 release：736 Node tests，735 pass / 1 fail（`stage-b-root-final-release.log` 及同名 `.json`）。
- 失败点 `tests/install.test.cjs:197` Claude install：对仓库根
  `permission-allow-config-30282-1788640660632.json` lstat ENOENT。
- 根因：旧 `tests/acpx-entry.test.cjs:54-55` 以进程 cwd（仓库根）相对路径写 config，子进程退出时
  unlink；并行 installer provenance（`adapters/_shared/provenance.cjs:126-156`）先 `git ls-files --others`
  枚举再对每个条目 `lstatSync`，枚举与 lstat 之间文件被删即 ENOENT。

## 修复内容（仅 `tests/acpx-entry.test.cjs`）

1. `runEntryTurn` 每回合 `fs.mkdtempSync(os.tmpdir()/ubp-acpx-entry-*)` 建独立临时目录；
   config 写入该目录（绝对路径），spawn `cwd` 与请求 `cwd` 均指向该目录，`agent_argv` 直接传绝对
   configPath。仓库根不再出现任何一次性文件，竞态在结构上消除。
2. 幂等 `cleanup()`（`fs.rmSync(workdir, {recursive, force})`，仅清理本回合自建目录）覆盖全部退出路径：
   正常 exit、30 s 超时（SIGKILL 后）、spawn error；`cleaned` 标志保证只执行一次、只删除任务自有路径。
3. 失效头注更正：生产 delegate driver 已迁移到同一公共 entry 契约
   （`skills/ultra-delegate/scripts/acp-driver.cjs:21,576` 的 `acpx-delegate-turn-request/v1`；
   `agent-execution-driver.cjs:646` 解析 `runtime/acpx_delegate_entry.cjs`），删除"old driver stays in
   place"表述，改为该 harness 固定公共边界的消费侧。
4. 未改任何断言/行为语义（entry 版本、raw permission options/locations、exact-option、typed result、
   misuse 拒绝全部保留）；未改 `tests/fixtures/fake-acp-agent.cjs`、entry 脚本与生产代码。

## 验证（真实公共 entry，与 Root 失败场景同源）

- entry：`/tmp/ubp-acpx-runtime-ppTQ/runtime/acpx_delegate_entry.cjs`
  SHA-256 `99049a249b8bf719914601cb82869692379e5a8bba8fff1ad51d796fe5a4c6bb`（SDK 0.13.2）。
- 命令（仓库根）：`UBP_TEST_ACPX_ENTRY=… node --test tests/acpx-entry.test.cjs tests/install.test.cjs`，
  entry 与 install 并行同跑，连续 3 轮：
  - run1 18 pass / 0 fail / 0 skipped，exit 0，8165.6 ms
  - run2 18 pass / 0 fail / 0 skipped，exit 0，7664.2 ms
  - run3 18 pass / 0 fail / 0 skipped，exit 0，7498.6 ms
- 4 项 entry 测试均真实执行（0 skipped），含 normal turn 与 permission 边界。
- 残留检查：仓库根无 `permission-*-config-*.json`；tmpdir 无 `ubp-acpx-entry-*` 残留；无新增仓库未跟踪文件。
- 完整成功输出：`.ultra/.runtime/owner-factory-implementation-20260905/stage-b-entry-fixture-isolation-validation.log`。
- 未自跑完整 release（按派发由 Root 在源定稿后统一执行）。

## 最终指纹与边界

- `tests/acpx-entry.test.cjs` SHA-256：
  `bc18be224a0bbb976d97b291f3a600cd42b1413b030b66e5ec33da022cc068d5`
- 实际用时远低于 1800 s ceiling（验证三轮合计约 23 s，全程含读写约数分钟）。
- 未做：commit（Codex 单独执行）、完整 release/pack/Doctor、Kimi kit 路径、生产与 entry 源码。
