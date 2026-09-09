# Stage B 修复构建身份与维护文案 handover（实际 ZCode → Root/Codex）

2026-09-06。本 handover 汇报本轮 mission 的两项修复：正向资格写回前的修复构建
身份区分，与两处旧引擎文案的最小真实同步。不宣称 Stage B 验收、不宣称 D1 正向
资格、不把任何维度改为 supported；Root 独立 review 与真实观察后才可能关闭。

## 一、修复 1：修复构建以既有身份 seam 与旧安装构建区分

### 决策与事实

- 决策：在既有唯一身份源（worktree `Cargo.toml` 版本 → clap `--version` stdout →
  host-profile `expectedStdout`/`bridge_build_marker` 精确相等比较）上给出真实修复
  版本标记 **`zcode-acp 0.1.0+ultra.zcode.0.16.5.r1`**（修复修订 r1）。无新增
  attestation/sandbox/gate；`agent-execution-driver.cjs` 零改动。
- 修复后临时二进制（离线 `cargo build --offline`，未替换任何已安装文件）：
  `target/debug/zcode-acp`，SHA-256
  `ebc2932b0d1c6c78efe133aea68d1e6616615eed8e2c5c229a41f3ba81ca9eba`，
  `--version` = `zcode-acp 0.1.0+ultra.zcode.0.16.5.r1`。
- 旧安装二进制（只读运行 `--version`，原样保留）：`/Users/rocky243/.local/bin/zcode-acp`，
  SHA-256 `0e9c8fb2827c566c8a623f3a9706715a221ce7a9b1d3eef32c839937c62420dd`
  （与 Root 观测一致），`--version` = `zcode-acp 0.1.0+ultra.zcode.0.16.5`。
  两者标记现已可区分。
- 历史保留：host-profile 内保留的负向资格记录 `qualified_identity` 未动，仍绑定
  旧标记（与其 receipt `adapter_version` 逐字一致）；因此当前声明身份（r1）对保留
  记录为 identity mismatch，各维度以 `version_mismatch` fail-closed——这是拆分后的
  正确真值，非缺陷。原 negative receipt/attempt/证据文件未改动。

### 真实二进制选择证明（无 Provider 调用、无 Host 启动）

`.ultra/.runtime/owner-factory-implementation-20260905/stage-b-build-identity-real-selection-proof.{cjs,log}`：
用生产 `selectExecutionDriver` + 真实 host-profile，对两个真实二进制运行真实探针
（runtime 探针用真实 App-bundled `zcode.cjs`（报告 `0.16.5`）；ACPX entry 仅作存在
性检查，指向 Kimi worktree 的真实入口文件，未启动）：

- 旧安装二进制：`driver=cli`、`fallback_reason=acp_candidate_identity_mismatch`、
  `candidate_identity_reason=zcode_bridge`、`candidate_identity_valid=false`——
  **既有候选选择在修复身份下拒绝旧标记**。
- 修复二进制：`driver=acp`、`fallback_reason=null`、`candidate_identity_valid=true`——
  **真实修复二进制标记与声明身份匹配**。

### 规范 patch 与 digest 消费者同步

- patch 以已验证的字节精确方式重生成（`git diff 42fe149d…`，8 段/729 行，仅
  Cargo.toml/Cargo.lock 版本行变化叠加在前轮修复之上）：SHA-256
  `8c127dba648720121da9326cae721141785f03ef72bdfae2201f50e59bb9cb36`。
- 消费者同步（三处 digest + 标记）：`host-profile.cjs`（buildMarker/sha256，附
  区别注释）、`tests/acp-driver.test.cjs`（绑定测试的 buildMarker/sha256）、
  `docs/RUNTIME-COMPAT-MATRIX.md`（digest、选择标记、保留记录段）。
  SKILL.md 的标记与保留记录段同步。前轮的 compatibility/locations/denial/
  cancelled/failed 修复全部保留（见下方测试证据）。
- 旧 digest `628b38d8…` 仅存于历史文档/旧日志（前 handover、旧 smoke JSON、旧
  bridge 修复日志），按历史保留不改写。Kimi 的 kit 从实际文件现算 digest（未硬编码），
  重生成不破坏 kit；kit 与其 README 未触碰，未发起任何 kit Provider 调用。

## 二、修复 2：两处旧引擎承诺文案的最小真实同步

真实边界依据（读取 pinned 公共入口实现与 Root 已有 review 记录）：ACPX runtime
按连接 owner/activeTurn 路由 session update（`runtime.js:805–832` 等），无逐条
`sessionId` 比较；UBP driver 消费的公共事件不携带 sessionId；旧 driver 的
32 条/256KiB 缓冲与逐条核验已随旧通用引擎移除。

- `delegation-contract.md`（原 119–124）：改为如实描述——创建期元数据由已安装
  公共入口按 owner/turn 缓冲并折叠、无逐条 session-ID 比较；driver 消费无
  sessionId 的公共事件；Ultra 自身不再做早期缓冲/回放/session 身份校验；**旧引擎
  的逐条 session-ID 等值检查不存在于该公共连接路由，是已知限制而非 Ultra 保证**
  （保留 SDK sessionId 严格比较差异这一限制的表述）。
- `SKILL.md`（原 164–167）：同一边界的最小同义改写。
- 复查中发现并同步同源第三处：`docs/RUNTIME-COMPAT-MATRIX.md` 原 126–130 仍承诺
  32 条/256KiB/逐 sessionId，已按同一事实改正。
- 未复活旧通用 ACP 引擎、未新增任何 gate/协议机制。官方 Skill Creator validator
  （anthropic-agent-skills `quick_validate.py`）对改动后的 ultra-delegate 通过
  （`stage-b-build-identity-skill-quick-validate.log`，"Skill is valid!"）。

## 三、验证与完整输出（均一次运行、全量留存，非轮询刷绿）

| 检查 | 结果 | 日志（同目录，前缀 stage-b-build-identity-） |
| --- | --- | --- |
| bridge `cargo test --offline` | 8 passed / 0 failed | bridge-cargo-test.log |
| bridge `tests/acp_client.py` E2E | 全部 `[ok]`（含 DENY-PROBES/NATIVE-CANCELLED/NATIVE-FAILED） | bridge-python-e2e.log |
| 两真实二进制标记+SHA | 已区分，旧 SHA 与 Root 观测一致 | binary-markers.log |
| 真实二进制选择证明 | PASS（旧拒绝/修复选中） | real-selection-proof.{cjs,log} |
| `node --test tests/acp-driver.test.cjs` | 35 pass / 0 fail / 0 skip | acp-driver-tests.log |
| `node --test tests/delegate.test.cjs` | 61 pass / 0 fail / 0 skip | delegate-tests.log |
| Skill 官方 validator | "Skill is valid!" | skill-quick-validate.log |

如实记录的中间失败：acp-driver 首轮 2 项失败，均为**旧身份同值前提下的既有断言**
（"retained enforcement qualification is bound to the exact redacted receipt"中
记录标记=当前源标记；"packet admission…"中真实记录维度为 unsupported/unobserved）。
按拆分后真值更新为"记录保留旧标记、与当前源标记不相等"与 `version_mismatch`
（含 CLI transport 的 missing→version_mismatch，'missing' 路径仍由具名构造用例覆盖）
后复跑 35/35。该首轮失败日志被复跑覆盖，失败名与断言差异如上逐字保留在本节；
后续未再重跑刷绿。delegate 套件在改动后首轮即 61/61。

新增具名回归："the repaired bridge marker is distinct and candidate selection rejects
the installed unqualified build"（acp-driver.test.cjs）覆盖：保留记录绑定旧标记且
与声明标记不同；旧标记探针 → `acp_candidate_identity_mismatch`/`zcode_bridge`；
修复标记探针 → acp 选中；以修复身份构造的全正向记录对旧声明身份全部
`version_mismatch` 且 `identity.match=false`——**同一历史身份翻正也不能录取旧构建**。
delegate.test.cjs 受影响 fixture 同步：pre-admission fixture 桥标记改 r1；
hypothetical 正向记录的 `qualified_identity` 显式绑定 live 声明身份；785 测试中
真实记录拒绝对的三处断言与 970 测试的维度状态改为 `version_mismatch` 并补
`identity.match=false`。

## 四、未证实 / 未完成（不宣称）

- **未运行任何真实资格**；当前记录仍 negative，未把任何维度改为 supported。
  正向写回归 Root 的真实观察（须以 r1 身份重新具名 attempt；届时保留记录应绑定
  r1 修复身份）。
- 未替换已安装 binary、未真实 HOME 安装、未 commit/push/publish、未动 kit 与
  Goal/agent-delegation 源（后者仅只读核实边界）。
- Root 保留的前轮 9 次全套中 2 个未具名失败：本轮未复现、未定位、不以"timing"
  免责；本轮全套日志已按名字全量留存，供 Root 最终整合 gate 对照。
- `docs/ARCHITECTURE.md:239` 仍提及保留记录绑定旧标记——该陈述在拆分后仍逐字
  为真（记录确实绑定该标记）且不涉及选择要求；该文件不在本轮授权路径内，未改，
  留给 Root 决定是否补充 r1 说明。
- 拒绝对维度状态由 unobserved/unsupported 变为 `version_mismatch` 是身份拆分的
  必然真值变化（fail-closed 不变）；如 Root 认为 refusal 文案需进一步区分历史
  观测，属后续文案轮。
- 会话期间多次 Ultra task-selection hook 诊断（legacy complexity、双 in_progress）
  为既有 ledger 观测，超出本轮两项修复边界，未改动任何 ledger 行。
- 未做 Stage C 及任何后续阶段实现。

## 五、变更清单（本轮实际触碰）

UBP 主检出（相对前轮未提交状态的**本轮增量**；文件级 SHA-256 前 16 位）：
`host-profile.cjs 0f330a88`、`SKILL.md 64d37f01`、`delegation-contract.md 301fe199`、
`RUNTIME-COMPAT-MATRIX.md d01ba174`、`tests/acp-driver.test.cjs 9e703cd3`、
`tests/delegate.test.cjs 0ea5f84a`、patch `8c127dba`（5974b626 为 worktree Cargo.toml；
修复二进制 ebc2932b）。bridge worktree 仅追加 Cargo.toml/Cargo.lock 的版本行变化，
其余六文件为本轮之前既有修复，未触碰。运行时目录新增 build-identity 前缀日志/脚本
如上表；`stage-b-zcode-build-identity-repair-{launch,receipt}.json/.stderr.log` 为
派发框架产物，非本任务写入。

建议 Root 下一步：源码 review 本轮 diff → 以 r1 身份执行真实正向资格观察 →
按严格流程写回新具名正向记录 → 最终整合 release gate（Kimi 完成后）。
