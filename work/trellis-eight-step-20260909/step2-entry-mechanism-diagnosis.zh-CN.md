# 入口机制诊断（只读）

日期 2026-09-09。作者：实际 Kimi（本隔离 checkout，只读诊断）。本文不改动任何代码、
评测标准或既有候选结论；事实、观察、假设分别标注。

## 一、已被源代码固定的入口机制（源事实）

被接受的产品里，用户到达 Ultra 工作流只有三条路，机制各不相同：

**1. 普通宿主对话（未点名任何 Ultra 路由）**

- 宿主在会话里只注入 Skill 清单：名称 + description。正文（SKILL.md）只有在模型
  主动调用 Skill 工具时才进入上下文。加载前模型可见的面**只有这一行**。
- 各宿主对这个面的暴露：`adapters/_shared/plugin-core.cjs:39-56` —— Claude/Grok
  写 `user-invocable` 并按策略加 `disable-model-invocation`（42-47 行）；Kimi 写
  `disableModelInvocation`（49-53 行）；OpenCode/ZCode 没有任何路由位（55 行的
  `base`，注释见 `adapters/_shared/runtime-assets.cjs:79-87`）；Codex 另有
  64 字符 `short_description` 与 `allow_implicit_invocation`
  （`plugin-core.cjs:58-68`）。
- `ultra-init` 不在 `HOST_DISCOVERY_WITHHELD_SKILLS`（只有 `ultra-delegate` 与
  `ultra-status`，`runtime-assets.cjs:87`），即它在四个暴露该位的宿主上**对模型
  可见**。这是刻意的：注释写明 init 是"`.ultra/` 存在之前唯一能运行的 route"，若
  不可见则"普通自然语言的新工作请求无法到达它"（`runtime-assets.cjs:82-85`）。
- Hook 面：`hooks/session_context.py:581-583` 的 idle guard 在 `.ultra/` 缺失时
  静默退出（`hooks/_common.py:80-88` 的 `project_root` 向上找不到 `.ultra/` 即
  返回 None）。因此对一个空目录的新会话，Ultra 在上下文里的全部存在就是清单里
  那一行 name+description。

**2. 显式用户选择进入**

- Owner 点名路由（宿主的原生命名空间调用，如 `/ultra-builder-pro:ultra-init`；
  Codex 侧 `default_prompt` 即 `Use $ultra-builder-pro:<name>…`，
  `plugin-core.cjs:64`）。正文加载后**自查入口**：粗发现位从不授权 explicit-entry
  mode，"Discovery is not authority"
  （`skills/ultra-status/references/route-contract.md:113-127`）。
- init 的两个 mode（create/recover）都分类为 `explicit-entry`
  （`runtime-assets.cjs:31-34`），但 init 正文同时规定：**当前请求本身就是
  Owner entry**，不需要二次确认；安装物、历史文件、磁盘上的骨架永远不是 entry
  （`skills/ultra-init/SKILL.md:40-44`）。README 的总规则一致："Public workflows
  are explicitly selected by the owner by default"（`README.md:100-106`），
  隔离合同同一表述（`docs/PLUGIN-ISOLATION-CONTRACT.md:3-6`）。

**3. CLI 入口**

- `ubp` / `ultra-builder-pro-cli` 只指向 `bin/install.js`（`package.json:5-8`），
  功能是安装/卸载/doctor（`bin/install.js:14-18, 84`）。**CLI 不是工作流入口**，
  不存在"用 CLI 启动一个 Ultra 工作流"的路径；它只产生前两条路所需的安装物。

三条路的关系：CLI 安装 → 之后普通对话靠"清单可见 + 模型自选 + 正文自查"，或
Owner 显式点名直接进入。不存在第四条路（无全局常驻注入；Hook 在无 `.ultra/` 时
静默）。

## 二、冻结评测实际测的是哪条期望（观察 + 推断）

我未被授权读冻结评测本身，以下从 Root 提供的 development 证据推断：

- F2-dev 的开场是一句**未点名任何路由**的普通自然语言
  （`development-evidence.md:9`）；判失败的点是**开工前漏掉实质用途问题**，Owner
  用途"因为问题从未被问而没有提供"；补问不算通过。Root 对 candidate1/2 的 live
  判定沿同一点（`HANDOVER.zh-CN.md` 一、三·五节）。
- 因此该评测测的是**第 1 条路**：普通未选择对话 → 相称行为（先定实质用途再建）。
  它测的不是显式点名进入，也不是"Skill 工具必须被调用"——ZERO Skill calls 是被
  诊断出的机制，漏问用途才是失败本身。
- 对照基线：相同条件下 baseline 也未做用途澄清（candidate2 反馈，
  `candidate2-live-feedback.md:3`）。即**宿主原生行为本身不产生被接受的行为**，
  该期望只能靠 Ultra 的进入来兑现。

## 三、已接受计划是否要求"普通未选择对话自动激活"（源事实 + 解读）

- 计划第二步的可感知效果明确写在普通自然语言请求上："Owner 说'做一个本地读书笔记
  工具'，Agent 会先解决用途与结果的关键歧义，**而不是要求 Owner 选择内部 mode**"
  （`thinking/trellis-direction-20260908/RESULT.md:99-110`，例见 :45）。
- 第一步的诊断框架同样预设了这条路："已有简单分支若从未被看到，修入口/加载；若被
  考虑后错误拒绝，才修路由"（`RESULT.md:38`）。
- 所以：计划要求的是**普通未选择对话上的行为效果**，不是某个具体机制；但产品为它
  选定的机制就是"init 保持模型可发现、由模型从清单自选、正文自查入口"
  （`runtime-assets.cjs:82-85` + `route-contract.md:120-127` +
  `ultra-init/SKILL.md:40-44`）。这条路在产品合同内是合法的——当前请求即
  Owner entry，加载不等于激活，安装/历史从不激活。
- 需要点名的结构性事实：**该机制依赖一个宿主不保证的概率性行为**（模型在约 43 条
  描述里选中某一条）。产品侧在加载前能动的杠杆只有 name+description 一个面。

## 四、现有证据定位到哪一层（观察）

- candidate2 的 transcript 直接证据：`attachment.type=skill_listing`
  （uuid `9eed1f01-0c24-48d9-ae75-d91d85250791`）含**完整未截断**的新
  ultra-init description，且出现在渲染后的 system-reminder
  （`candidate2-live-feedback.md:5`）。安装/发现/截断/禁用均已排除。
- baseline 与三个 description 候选（r1/r2/r3）在 F2 开场全部 ZERO Skill calls、
  全部漏问用途（`HANDOVER.zh-CN.md:6-9`；candidate3 失败为本任务 Root 提供的
  观察）。**正文从未被加载过**，"加载后行为错误"这一层至今没有任何观察。

## 五、假设分列（假设，非结论）

- H1（清单层选择失败）：模型看到了完整描述，但从一句宽泛痛点直接推定用途已足够，
  不自选 init。三轮 description 修订（内部词汇 → 结果导向 → 可观察类别）均未改变
  结果，**description 杠杆的解释力应按已耗尽处理**（与 `HANDOVER.zh-CN.md` 六的
  r3 不确定性一致）。
- H2（加载后行为失败）：正文被加载后仍不问用途、错选 mode 或过度触发。**零证据，
  未被测过**。
- 两者现在的代价完全不同：H1 的剩余杠杆（改名、常驻注入、宿主级呈现）都超出默认
  授权或兼容性代价大；H2 只是一个正文级 bounded 修复。先用最便宜的实验把它们分开。

## 六、最小的合同内判别实验（建议，Root 执行）

用冻结 candidate3 字节、同一 F2 开场、同一份只含效果/数据范围的
`--append-system-prompt`（沿用 `candidate2-live-feedback.md:9` 的配对做法），
只改变**进入方式**这一个变量：

- **E1（显式进入）**：Owner 消息 = 原开场白 + 显式点名路由（如
  `/ultra-builder-pro:ultra-init 我每天开会记的东西到处都是，帮我弄个能整理会议
  记录的小东西吧。`）。这是产品合同内**已设计好的 explicit-entry 模式**
  （`route-contract.md:103-111`），不是把显式调用伪装成自然自动加载；评测标准
  不动。
- 判定：E1 中正文是否在开工前问出那几个会改变结果的用途问题、保留 Owner 原话、
  然后交回普通实现（对照 `ultra-init/SKILL.md:34-38, 76-80`）。
- 解释：
  - **E1 通过 + 普通场失败** ⇒ H1 成立：正文健康，缺口纯粹是"清单层不被选中"；
    description 路径已耗尽，不应再微调措辞。
  - **E1 失败** ⇒ H2 成立：正文本身不修用途判断，进入 bounded 正文修复。
- 辅助零成本观察（弱证据，仅参考）：在已失败的普通场 transcript/续谈里看模型是否
  曾提到或考虑过 ultra-init——自述不可靠，不作判据。
- 明确排除的做法：为区分 H2 而用 hook/注入把正文塞进普通场——未获授权且会把显式
  加载伪装成自动加载。

成本：一次计量运行，无代码改动，无评测改动，无新增机制。

## 七、结论：一个（条件触发的）Owner 决定 + 备选代码任务

**现在不需要新的代码任务**：没有任何已复现的"加载后缺陷"可修，description 杠杆
已被四次运行证伪，继续改措辞不属于已确立的修法。下一步就是第六节的 E1。

- **若 E1 失败** → 建议的有界代码作者任务：只修 `skills/ultra-init/SKILL.md` 正文
  的 create 入口行为（进入后先按既有 grilling 方法问会改变结果的用途答案，再建或
  停止），范围限该文件与其既有结构检查；不动 mode 归属、发现位、Hook、评测；由
  Root 用同一显式进入方式复跑验收。
- **若 E1 通过** → 一个无法回避的 Owner 决定（建议现在连同一并给出）：
  > **"普通未选择对话上的自动进入"是否仍是产品必须承诺的行为？宿主只给
  >  name+description 一个加载前面，选中不可被产品强制。**
  我的建议：不改名为默认动作、不加常驻注入；把产品承诺如实表述为"显式点名保证
  到达；普通对话为可发现、模型自选、正文把关的 best-effort 入口"，并据此让
  Owner 决定评测期望与第二步验收措辞是否需要相应调和（这属于 Owner 对承诺边界
  的决定，不是作者可在合同内自选的实现细节）。

## 证据限度

- 未读冻结评测、保留 fixture、主 checkout 任何材料；第二节关于评测期望的表述是
  从 development 证据的推断。
- 未跑任何 live 试验、未改任何代码/测试；candidate3 失败来自 Root 提供的观察，
  我未独立复跑。
- H1/H2 均为假设；第六节的实验是区分它们的最小手段，其结果本身也需要 Root 的
  冻结字节运行才成立。
