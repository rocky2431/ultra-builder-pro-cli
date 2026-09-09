# Stage B ZCode：Claude 既有 ACP 路径实现交接（D1Q-02R2 候选）

实际作者：ZCode（本回合，独立于被取消的 28122586… 回合；该回合一事无成，其回执保留）。
日期：2026-09-06。中文交接；实现/测试/模型面文案为英文。

## 结论

按已激活 mission（stage-b-zcode-claude-path-mission.md，2026-09-05T23:47:57Z 激活；本回合另见
stage-b-zcode-claude-path-resume-mission.md 的取消说明）完成了最小真实生产路径与 kit 适配：

1. 生产 `host-profile.cjs`：claude ACP 选择改为「显式 `ULTRA_CLAUDE_ACP_COMMAND` 绝对路径覆盖 →
   公共 managed agent-delegation 注册表（`~/.config/agent-delegation/config.json`，与 Kimi 新增的
   公共 entry resolver 读取同一注册表语义）预装 adapter → 旧 npx 0.70 兜底」。注册表路由同时由
   launcher 通过 adapter 支持的 `CLAUDE_CODE_EXECUTABLE` env 注入其精确原生绑定；该键不在
   envDiscovery 中，继承的任意控制变量仍被过滤。本机解析为 adapter
   `@agentclientprotocol/claude-agent-acp@0.75.1`、SDK `@anthropic-ai/claude-agent-sdk@0.3.257`、
   native `/Users/rocky243/.local/bin/claude → versions/2.1.261`（`claude --version` 实测输出
   `2.1.261 (Claude Code)`）。
2. 注册表健康绑定时，claude profile 动态携带中性 `candidateIdentity`（registry 声明字符串）与
   `identityProbes`（每次选择实跑 `claude --version` 精确比对，防"声明即事实"），并声明
   `runtimeFilePath`（注册表原生绑定文件）。`agent-execution-driver.cjs` 的执行身份字节绑定在
   保留资格记录存在且字符串匹配时改按 profile 声明哈希原生文件（而非 PATH 拼写的 cliCommand）。
   claude 无 enforcement 记录：no-record 旧式准入不变，未伪造任何正向记录或猜测哈希。
3. D1Q-02 kit 新增 `--profile claude`：prepare 绑定注册表文件、adapter 字节+包身份、SDK 包身份、
   原生绑定字节+实时版本输出、公共 entry（f734）+ acpx 0.13.2（共享 resolver 语义）、UBP 六源
   摘要、instruction/permission 摘要、隔离 worktree 内 `.claude/settings.json` 与
   `settings.local.json` 精确字节，以及主 checkout `.claude` 的只读前后观察；execute 逐项拒绝漂移。
   无 bootstrap 覆盖需要存在（claude 无记录可删），wrapper 仅观察最终 Host env 键名后 exec 真实
   adapter。两阶段（prepare-only → 外部记录 attempt → execute）与不可变 prepared 超时不变。

未完成且如实保留：Claude 候选仍未 qualified；真实资格（含计费的第一个 tool 与允许 Write/各独立
拒绝探针观察）只归 Root。无 commit、无安装、无嵌套派发、未改任何真实 HOME/主 checkout 配置。

## 生产路径细节（变更点）

- `skills/ultra-delegate/scripts/host-profile.cjs`
  - 新增 `claudeInstalledAcp(env)`（HOME 相对读取注册表；无 HOME/无注册表/无 claude target →
    null → npx 兜底；已发布但损坏的 target 抛错 → 选择以 `acp_candidate_invalid` 类型化回退
    CLI，绝不静默换 adapter）、`claudeAcpSelection(env)`（覆盖 → 注册表 → npx）。
  - `HOST_ENV_DISCOVERY.claude` 增加 `ULTRA_CLAUDE_ACP_COMMAND`（与 ZCode bridge 选择器对称）。
  - claude profile `acp.command/argv` 改为动态解析；新增 `delegateEnv()`：注册表健康时注入
    `{ CLAUDE_CODE_EXECUTABLE: <注册表原生绑定> }`，否则注入空（npx 兜底自解析 CLI）。损坏时
    delegateEnv 吞错返回空——此时 ACP 选择已先行类型化失败。
  - `hostProfile(runtime, { env } = {})` 第二参数注入（生产默认 process.env 不变）；claude 且
    注册表健康时附加 `surface`（preinstalled …registry）、`candidateIdentity`、`identityProbes`、
    `runtimeFilePath`；不健康时保持旧 npx surface 且无 candidateIdentity（任何记录都无法字符串
    匹配未声明候选）。
- `skills/ultra-delegate/scripts/agent-execution-driver.cjs`
  - 新增 `declaredRuntimeFilePath`；`selectExecutionDriver` 在 `requiredIdentity` 生效时优先用
    `acp.runtimeFilePath({host, cliCommand, env})` 解析待哈希原生文件（解析失败 → unobserved →
    同一类型化身份缝隙 fail-closed）。无记录路由（现网全部）行为不变。
- 未改 `delegate.cjs`：envViews/delegateEnv/spec 既有通用缝隙已足够。
- 文案：`skills/ultra-delegate/SKILL.md`、`skills/ultra-delegate/references/delegation-contract.md`、
  `docs/RUNTIME-COMPAT-MATRIX.md`（claude ACP 行）如实更新：预装优先、npx 兜底、注册表原生绑定、
  现有 conformance 回执为 npx 路径所得（安装路由未单独重取）。

## Kit `--profile claude` 细节

- prepare（副作用前全部拒绝）：`UBP_DELEGATE_CLAUDE_BIN` 真值拒绝（对称 zcode 的
  `UBP_DELEGATE_ZCODE_BIN`）；entry 必须解析（本机注册表缺 `acpx_delegate_entry` 键，须显式
  `ULTRA_DELEGATE_ACPX_ENTRY`）；acpx 包用 driver 的共享 resolver（entry realpath + Node
  node_modules 上溯，含 symlink 语义）；注册表健康解析后绑定 `claude_registry(_sha256)`、
  `claude_adapter(_sha256)`、`claude_adapter_package`（name@version:package.json sha）、
  `claude_sdk_package`（同格式；从 adapter 真实目录 `require.resolve('@anthropic-ai/claude-agent-sdk')`
  解析）、`claude_native_executable(_sha256)`、`claude_native_realpath`、
  `claude_native_version_output`（实跑 `--version`，与注册表声明不一致即在 prepare 拒绝）、
  `declared_candidate_identity`、null 覆盖绑定。worktree 建立后写入确定性 settings 字节
  （`.claude/` 在本仓库被 git 忽略，fence 清洁性不受影响）并绑定两文件摘要；主 checkout
  `.claude/settings{,.local}.json` 只读记录基线。
- settings 字节（两文件相同，`renderClaudeSettings()` 确定性）：`permissions.ask` 覆盖
  Write/Edit/MultiEdit/NotebookEdit/Bash/WebFetch/WebSearch/Task（官方 ask 优先于任何层的 allow，
  只读 Bash 亦可被 ask 规则要求确认）；`defaultMode: "default"`（压制用户层 acceptEdits/bypass）；
  `disableAllHooks: true`（关闭普通分层 Hooks）。不删工具、不加政策。
- execute：13 项 claude 漂移行（覆盖值、注册表路径+摘要、adapter 路径+摘要、adapter/SDK 包三元、
  原生路径+摘要、实跑版本输出、两 settings 摘要、声明身份 JSON）+ 通用行（entry/包/UBP 源/HEAD/
  instruction 含 sink 替换/permission）。wrapper 记录最终 Host env 键名（应见
  `CLAUDE_CODE_EXECUTABLE`，来自 launcher 的 spec.env 注入）后 exec 注册表 adapter 本体。
  observation 新增 `claude_settings_observation`（机制说明、worktree 两文件摘要、主 checkout
  前后摘要与漂移文件列表——创建/改写/删除均判漂移）。stdout 摘要新增
  `claude_main_checkout_drifted_files` 与 `claude_worktree_settings_unchanged`。
- self-check 新增 claude 段：无 HOME/无注册表 → null（npx 兜底）；健康注册表精确解析；发布但
  损坏 → 抛错 fail-closed；settings 字节确定性且不含 deny。

## 测试与自检证据（本回合实际运行）

- `tests/acp-driver.test.cjs`：55/55（新增 3 个 claude 测试：注册表消费/fail-closed、探测身份与
  delegateEnv/env 边界、合格记录按 runtimeFilePath 字节绑定原生文件并拒绝同版本漂移；并把原
  「六 Host 各自 conformance 行」测试改为隔离 HOME，消除本机注册表泄漏导致的机器依赖）。
- `tests/delegate.test.cjs`：65/65（扩展 env-discovery 缝隙：`ULTRA_CLAUDE_ACP_COMMAND` 过
  probe/host 两缝、继承的 `CLAUDE_CODE_EXECUTABLE` 被排除）。
- 真实 entry 套件（`UBP_TEST_ACPX_ENTRY=/tmp/ubp-acpx-protocol-root-z4cncgah/runtime/acpx_delegate_entry.cjs`，
  SHA-256 `f734ed38cce00f14aa3229a6b21f8c7a452d6f7c2ef46f6b362907ba6aacecbd`，与 Root 审阅一致）：
  `tests/acpx-entry.test.cjs` + `tests/acp-conformance.test.cjs` 8/8。
- `tests/v026-adapters` + `tests/route-contract` + `tests/acp-conformance` +
  `tests/skill-authoring` + `tests/package-smoke`：46/46。`tests/install` + `tests/ultra-5-journeys`：
  19/19。未跑全量 verify:release（主体仍在变动，归 Root 终验）。
- kit `--self-check`：PASS（含新增 claude 段）。
- kit `--profile fixture-smoke` 真跑（无 provider 调用）：三个拒绝维度均观察到
  attempt-and-rejection，coordinator liveness 记录，`permission_denied` 终态，无 env 键泄漏；
  并实测了 execute 对发散 `--timeout-seconds` 的不可变超时拒绝。
- kit `--profile claude --prepare-only` 真跑（离线，dispatch 前退出）：全部绑定解析成功（数值见
  下）。plumbing attempt 与其 worktree 已清理（`git worktree prune` 后仅剩先前作者的证据
  worktree）。

## 两阶段 Root 命令（审阅后即可执行）

前置事实核对（Root 自行复查，勿沿用本文件数字作为资格依据）：

```bash
cd "/Users/rocky243/Context Engineering/ultra-builder-pro-cli"
# 入口（Root 隔离副本，已审 f734）
echo "$(shasum -a 256 /tmp/ubp-acpx-protocol-root-z4cncgah/runtime/acpx_delegate_entry.cjs)"
# 注册表健康绑定 + 原生版本实测
node -e "const {claudeInstalledAcp}=require('./skills/ultra-delegate/scripts/host-profile.cjs');console.log(JSON.stringify(claudeInstalledAcp(process.env)))"
/Users/rocky243/.local/bin/claude --version   # 期望 2.1.261 (Claude Code)
unset UBP_DELEGATE_CLAUDE_BIN UBP_DELEGATE_ZCODE_BIN   # 真值会被 prepare 拒绝，先清空
```

阶段一（prepare，离线，任何 provider 调用之前退出）：

```bash
cd "/Users/rocky243/Context Engineering/ultra-builder-pro-cli"
export ULTRA_DELEGATE_ACPX_ENTRY=/tmp/ubp-acpx-protocol-root-z4cncgah/runtime/acpx_delegate_entry.cjs
ATTEMPT=d1q02r2-claude-$(date -u +%Y%m%d%H%M%S)
KIT=work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs
OUT=.ultra/.runtime/owner-factory-implementation-20260905/${ATTEMPT}-observation.json
node "$KIT" --prepare-only --attempt-id "$ATTEMPT" --profile claude --output "$OUT"
```

Root 外部记录该命名 attempt 并审阅
`.ultra/.runtime/stage-b-d1q02/${ATTEMPT}/dispatch.json` 的全部绑定后，才进入阶段二
（真实计费资格回合；观察窗内不得改动 dispatch 绑定的任何文件）：

```bash
node "$KIT" --execute --attempt-id "$ATTEMPT" --profile claude --output "$OUT"
```

判定输入：`denial_observations`（各维度须各自 attempt-and-rejected）、
`tool_call_observations.unmediated_completed_execute_sequences`（须为空——非空即 r1 类原生绕过）、
`probes.allowed_observed`（许可范围内 Write 完成）、`claude_main_checkout_drifted_files`、
`env_key_evidence`（含 wrapper 键名表中应出现的 `CLAUDE_CODE_EXECUTABLE`、不得出现的两个 canary）。
只有 Root 观察成功后才存在正向记录写入（本回合未写、不预写）。

## 精确源绑定（本回合结束时 SHA-256）

- skills/ultra-delegate/scripts/host-profile.cjs
  `025e3726c0432a2d46de8d9dbd11d19773cde6a6399a0c9d2941e9e12d1697b0`
- skills/ultra-delegate/scripts/agent-execution-driver.cjs
  `c664d57e27eedf2ae3ad80672666277f78cf0ffe713ccae4ae7a925ea5d49a5a`
- tests/acp-driver.test.cjs `75fcf13e17fa43671ef5e6a2ceea4b31ac14aaf3f1854e25eb627a3e79804dd6`
- tests/delegate.test.cjs `ca5b133836f682f96287ec4fa7c956fe854252eaa6ece89497eefe144a0da802`
- work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs
  `265abc8fe0ee6611954465b9f7e08e2999e770906d3f9e2c39820a9739c46402`
- SKILL.md / delegation-contract.md / RUNTIME-COMPAT-MATRIX.md：相应行内如实更新（未另行哈希）。

外部绑定（prepare 时实测，Root 须重核）：registry `config.json`
`9854eb13b589285377c2f09113b8ff2389e095e3a022df2b4340a2940c83dc82`；adapter `dist/index.js`
`9d73d1f0f121fb96cc8badb28c22d5bff02d8582eb2e40360a81c189e1b9422a`（package.json
`dae22001af6c5014fc6674d79a18960ccd1ff1f7aa0cb913c9e39b15d9332e67`）；SDK package.json
`f92d513adbb9e3dc09179edd95f9fbc817bf3f475566f22a0aba1e521597d17e`；native symlink 目标
`5efecaff231b798be3c66def9be54183623b328b80eaef17f93c43987024e82a`；acpx package.json
`365d2b9f3e260f03517e45cc7e207931644e91bfe7f66143d9aea47c95b64587`。

## 诚实限制与未解决事实

1. Linked-worktree settings 歧义（官方 v2.1.211+）：隔离 worktree 内 `settings.local.json` 可能
   被原生 CLI 解析到主 checkout 根。缓解：两 project 文件同字节写入 + 主 checkout 前后只读观察；
   原生 CLI 是否消费了隔离设置，只由真实观察到的 permission 事件判定，不预设。
2. HOME 保留（既有授权认证路径）：用户层 settings/hooks 仍可被读取；隔离依靠 project 层
   ask/defaultMode/disableAllHooks 的优先级。managed/enterprise hooks 低层不可关闭——本机当前
   不存在 managed-settings.json（只读核实），这是机器事实而非产品保证；若未来存在不可隔离
   effect，应如实不可用。
3. 安装路由的 conformance 回执系 npx 0.70 路径所得，0.75.1 未单独重取（compat matrix 已注明）。
   若资格后需要 conformance，按激活附注：普通调用走现有 selector，override 仅限显式真实
   bootstrap，并补现有缝隙回归。当前 conformance override 不能提供合格执行身份，也未绕过
   shared launcher；缺失 launcher 绑定仍为 generic Error（未命名新类型）。
4. `claude --version` 输出 `2.1.261 (Claude Code)` 作为 probe 精确匹配串：原生升级即类型化
   identity mismatch → CLI 回退（fail-closed，非静默）。
5. 本机注册表缺 `acpx_delegate_entry` 公共键（沿用旧固定位置亦不存在）→ 不显式
   `ULTRA_DELEGATE_ACPX_ENTRY` 时 claude/zcode ACP 选择将以 `acp_entry_unavailable` 回退。
6. Kit runtime base 必须位于项目根内（launcher 要求 instruction 在 projectRoot 内）；/tmp base 的
   plumbing 教训已吸收（本回合实测拒绝后改用默认 base）。
7. ZCode r1 负向记录与 experimental 成熟度未动；r2 拒绝快照保留。Kimi 0.41.0 公共缝隙结论未动。
8. 本回合未消费任何真实 provider 资格 attempt；`claude-path-plumbing-*`/`claude-plumbing-smoke*`
   仅为 plumbing attempt，已连同 worktree 清理，不得当作资格证据。
