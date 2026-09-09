# 步骤 1 评测材料交接（新增日常工作流三类任务族）

作者：实际 Claude Code（实现/测试作者）。授权：`.ultra/decisions/2026-09-09-eight-step-implementation.md`；
计划：`thinking/trellis-direction-20260908/RESULT.md` 第一步。基线 HEAD `b765b55cca0e1eaacebc738a68de77906bb50756`。

本轮只新增评测材料，**没有**改动任何产品 Skill / hook / adapter，**没有**发起任何 provider 调用、
安装、依赖变更、真实 HOME 或凭据操作，**没有** stage/commit/push。原有未提交的 Stage B 文件原样保留。

## 一、新增文件（精确清单）

评测规格与结构检查：

- `tests/evals/trellis-daily-20260909.json`
- `tests/trellis-daily-eval.test.cjs`

Fixture（`tests/evals/fixtures/trellis-daily-20260909/` 下）：

| 目录 | 用途 | 起点状态 |
|---|---|---|
| `f1-csv-quoting/` | F1 开发案例 | 红：6 tests / 4 pass / 2 fail |
| `f1r-note-slugs/` | F1 预留案例 | 红：5 tests / 2 pass / 3 fail |
| `f3-money-split/` | F3 开发案例 | 绿：3 tests / 3 pass |
| `f3r-utc-events/` | F3 预留案例 | 绿：3 tests / 3 pass |

各 fixture 内文件：`package.json`（`npm test` 显式列出测试文件名）、`README.md`、
`src/*.js`（两个消费者）、`test/*.test.js`（冻结断言），
F3 两个 fixture 另有 `docs/decisions/`（当前生效决定）与 `docs/notes/`（一份已废弃、一份无关）。
F2 两个案例是空目录起步的 0→1 请求，不需要 fixture。

## 二、三类任务族与开发/预留分离

每族**一个开发案例 + 一个预留案例**，fixture、缺陷、产品、项目事实互不重叠：

- **F1 明确的本地缺陷修复**：开发案例 `F1-dev`（审计 CSV 转义：备注含 `"` 时既不加引号也不双写，
  兄弟消费者 `src/report.js` 走同一个序列化函数，且表头 `id,actor,note` 必须保持不加引号）；
  预留案例 `F1-res`（笔记 slug：纯中文标题塌成空 slug，兄弟消费者 `src/filenames.js` 文件名互撞，
  且现有英文 slug 不得改变）。诊断重点：入口是否加载、路由是否相称、收尾是否重复。
- **F2 模糊的 0→1 产品请求**：`F2-dev`（会议记录整理）、`F2-res`（收据/账单管理）。
  只有一句模糊开场，后续答案全部取自冻结的 `owner_answer_script`。
- **F3 既有项目连续迭代与上下文往返**：`F3-dev`（整数分与平摊尾差守恒）、`F3-res`（UTC 存储与展示边界）。
  两个 session，第二个是 fresh session，只能通过项目文件继承事实。

预留案例的前置条件写在规格 `case_separation` 里：只有对应开发案例的修复被验收后才可运行，
且候选不得曾对着预留 fixture 或其 Owner 消息做过检查。**本轮没有运行任何预留案例的评测流程**；
只对预留 fixture 本身跑了它自带的 `node --test`，用于确认起点状态与后续可运行性（见第五节）。

## 三、冻结的初始 Owner 消息

以下为逐字冻结文本，运行时一次只发一条，不得改写、合并或提前展示后续轮次：

- `F1-dev` turn 1：`接手这个小项目。导出的 CSV 有问题：备注里带英文双引号的那一行，导进表格后列就错位了。先复现再修，修完给我证据。`
- `F1-dev` turn 2：`再确认整份报表的导出和单行导出行为一致，不要一个对一个错。`
- `F1-res` turn 1：`这个笔记工具有个 bug：标题全是中文的笔记，存出来的文件名都一样，互相覆盖了。先复现再修，修完给我证据。`
- `F1-res` turn 2：`现有英文标题的文件名不能变，已经有笔记按那个名字存着了。`
- `F2-dev` turn 1：`我每天开会记的东西到处都是，帮我弄个能整理会议记录的小东西吧。`
- `F2-res` turn 1：`我手机里和邮箱里的收据、账单一堆，帮我弄个能管起来的小东西吧。`
- `F3-dev` session 1：`给这个分账工具加个功能：一笔支出在几个人之间平摊。`
- `F3-dev` session 2（fresh）：`再加一个：把平摊的结果导出成一行摘要，我好贴到群里。`
- `F3-res` session 1：`给这个事件日志加个功能：按天统计每天有多少条事件。`
- `F3-res` session 2（fresh）：`再加一个：把某一天的事件列出来给我看，我要核对上海时间下午的那几条。`

F1 的表头约束**不在** Owner 消息里，它只出现在 fixture 自带的冻结测试和 README 中；
这是有意的诊断点（材料就在仓库里，没读到就是缺料或有料未消费），不是不公平的陷阱。

## 四、合法的后续回答（仅 F2）

`F2` 的两个案例各有两条冻结答案，第一条解决真正的产品用途歧义，第二条限定第一版范围：

- `F2-dev` 用途答案：`就我一个人看，不共享。我要的是过后能找回‘上次那个决定’——按关键词找出来，还能看到是哪天记的。`
- `F2-dev` 范围答案：`能记进去、能按关键词找出来、能看到日期，就够了。别的以后再说。`
- `F2-res` 用途答案：`自己记账用，不报销，也不要连银行或邮箱。我想知道这个月一共花了多少，还能按商家找回某一笔。`
- `F2-res` 范围答案：`能录一笔（商家、金额、日期）、能按商家找、能看这个月合计，就够了。别的以后再说。`

脚本外的问题，operator 一律逐字回 `你判断就好，按你觉得合适的做。`，并把该问题记进对应诊断分类。
operator **不提供**存储格式、语言、依赖、界面形态或任何内部流程选择——实现方法不预设、不计分。
`must_not_require` 明确列出不该发生的事：把内部 mode/Skill/路由/阶段丢给 Owner 选、
为隔离目录内的普通本地读写/跑测试要审批、加 Owner 没要的功能、两条答案都给完后还继续澄清。

## 五、可执行的 setup / verification 命令

结构检查（本轮已运行，结果见第七节）：

```bash
cd "/Users/rocky243/Context Engineering/ultra-builder-pro-cli"
node --test tests/trellis-daily-eval.test.cjs
```

单个 fixture 起点状态（`f1-csv-quoting` 与 `f1r-note-slugs` 必须非零退出并保持红）：

```bash
cd tests/evals/fixtures/trellis-daily-20260909/f1-csv-quoting && npm test; echo "exit=$?"
```

各 fixture 的 `npm test` 与结构检查都**逐个列出测试文件名**，不用 `--test test/` 目录参数：
仓库内并发 writer 刚记录过该目录参数在支持的 Node 区间内不可移植（v25.7.0 上会把目录当模块入口解析）。

环境注意：本机 `/tmp/package.json`（ZCode Desktop 遗留，含 `"type": "module"`）会让写在 `/tmp` 下
无扩展名的 CommonJS stub 被当成 ESM 加载。给整套 `npm run test:node` 强加 `TMPDIR=/tmp` 时，
`tests/install.test.cjs` 与 `tests/ultra-5-journeys.test.cjs` 共 4 项会因此失败（`require is not defined
in ES module scope`）。用默认 TMPDIR 运行即全绿；本轮新增的检查不依赖 TMPDIR。

工作区注意：本轮期间 `package.json` / `package-lock.json`（js-yaml `^4.3.1` → `^4.3.2`）与
`tests/owner-journeys-eval.test.cjs`（上述目录参数移植性修复）由**其他并发 writer** 改动，
不属于本轮范围，已原样保留、未回退、未纳入本轮清单。

运行前的 fixture 哈希基线（fixture 目前未提交，所以用 `git hash-object` 而非 `git ls-files -s`）：

```bash
find tests/evals/fixtures/trellis-daily-20260909 -type f | sort |
  while read -r f; do printf '%s %s\n' "$(git hash-object "$f")" "$f"; done
```

隔离副本与隔离安装件（真实运行时由 Root 执行；本轮未执行）：

```bash
RUN="$(mktemp -d /tmp/ubp-trellis-daily-XXXXXXXX)"
cp -R tests/evals/fixtures/trellis-daily-20260909/f1-csv-quoting "$RUN/project"
node bin/install.js --claude --config-dir "$RUN/cfg"      # 只写隔离 configDir，不碰真实 HOME
node bin/install.js --claude --config-dir "$RUN/cfg" --doctor --json
```

运行结束后再跑一次上面的哈希命令，与运行前逐行比对，确认仓库内 fixture 未被改动。

## 六、各族验收观察点

- **F1**：修复前红输出留证；修复后 6/6 或 5/5 全绿且 `test/` 与冻结 fixture 的 diff 为空；
  修复落在共享函数上（由兄弟测试证明，不接受叙述）；表头/现有 slug 不被破坏——
  只让单行断言过而破坏兄弟消费者算 wrong completion；交付声明引用真实绿色输出。
- **F2**：Owner 说出的两件事必须在隔离目录里真跑通并记录命令与输出；数据跨进程存活；
  live path 无 mock/stub；模型自己写的测试在干净副本上通过；`must_not_require` 一条都没发生。
  存储格式、语言、界面不计分。
- **F3**：平摊在不能整除时（如 1000 分 3 人）各份为整数分且严格求和等于总额；
  既有 `test/money.test.js` / `test/event-log.test.js` 未修改且通过；
  第二个 session 的摘要走既有展示边界；两个 session 都没让 Owner 重述金额表示/尾差/格式化规则；
  已废弃 note 的做法未被采用、两个反例都没被当成当前依据；仓库内 fixture 未被改动。

诊断分类固定为七个：`entry_not_loaded`、`wrong_route_selected`、`material_missing`、
`material_present_unconsumed`、`material_redundant`、`closeout_repetitive`、`undetermined`。
分不清原因就记 `undetermined` 并保留为待验证假设，不许并入相邻分类把记录做整齐。
**文件被读到只证明传递；只有最终行为正确才证明消费**——这条写在 F3 的 `consumption_observation` 里。

## 七、source 与 generated-install 的同一性判定方法

沿用 2026-09-05 的双 manifest 方法，未新造机制：

1. 记录 `git rev-parse HEAD` 与 `git status --porcelain`——候选通常仍未提交，真正的冻结是内容 manifest。
2. 对候选源文件与每个安装件副本各取 `git hash-object`，按**双 manifest** 判定：
   逐字拷贝的文件（references、hooks、scripts）必须等于冻结的源哈希；
   每个安装后的 `SKILL.md` 必须等于该 Host adapter 从同一源生成的**预期生成哈希**——
   adapter 在安装时会重新序列化 Skill frontmatter，字节差异是预期生成差异，不是源码漂移。
3. 记录隔离安装命令与 `--config-dir`、安装件版本与路径，以及 Host 自己的 discovery 输出
   （哪个副本 enabled、版本、skillCount），避免同名副本静默胜出（Stage A 出现过这个问题）。
4. 只有对冻结生成 manifest 出现**非预期**不一致时才中止并记录漂移。

## 八、保留的证据轴

四条证据轴逐字沿用 2026-09-05 规格，未合并、未放宽：

- `source-contract-test`：确定性仓库测试，回路里没有模型。本轮新增的 `tests/trellis-daily-eval.test.cjs` 属于这一轴。
- `scripted-owner-replay`：**输入来源轴**。输入确定、模型不确定；与真实 provider 执行可以同时成立，
  但**永远不是真人判断的证据**。
- `live-provider-run`：**执行方式轴**。已配置、已授权 provider 上的真实会话，可以由冻结脚本输入驱动。
- `live-human-observation`：输入与判断都来自真人，脚本输入永远不能模拟它。

## 九、本轮已核实的事实

- 四个 fixture 的起点状态由实际运行确认（Node v26.8.1）：
  `f1-csv-quoting` exit=1，6 tests / 4 pass / 2 fail，失败断言为
  「a field containing a double quote is quoted and its quotes are doubled」与
  「the report escapes quotes exactly like the single-row export」；
  `f1r-note-slugs` exit=1，5 tests / 2 pass / 3 fail；
  `f3-money-split` exit=0，3/3；`f3r-utc-events` exit=0，3/3。
- 两个红 fixture 的冻结断言**可达**：我在 `/tmp` 的副本上各写了一份最小正确实现
  （`"` 纳入需引号字符集并双写内引号；非 ASCII 标题回落到标题的稳定摘要），
  两套测试分别 6/6 与 5/5 全绿，随后删除了副本。仓库内 fixture 未被改动，红状态原样保留。
  这只说明验收可达，不说明任何 Host 会达到。
- `tests/trellis-daily-eval.test.cjs`：9 tests / 9 pass / 0 fail，exit=0（命令见第五节）。
- 整套 `npm run test:node`（默认 TMPDIR）：773 tests / 769 pass / 0 fail / 4 skipped，exit=0。
  该计数含工作区里未提交的 Stage B 测试改动，不是干净基线的计数。
  尚未运行 `npm run test:hooks`、`npm run verify:release`、`npm pack --dry-run` 与 Doctor——
  本轮未改产品源或打包面，这些由 Root 在验收时执行。

## 十、不主张的内容与剩余的 live 工作

不主张：写出这些 fixture 改善了产品；也不主张任何路由、加载或上下文机制已经变好。
只有真实运行并记录观察才能定位缺口，只有被验收的修复才能说改善。每族两个案例是为定位机制选的诊断样本，
不是统计充分性，不支持生产率结论。脚本输入不是真人判断。

剩余 live 工作（全部由 Root 独立执行，本轮未做）：

1. 冻结候选并生成隔离安装件，记录第七节的四项同一性数据。
2. 在真实已配置 provider 上运行 `F1-dev`、`F2-dev`、`F3-dev`（F3 两个 session 分别 fresh），
   一次只发一条冻结消息，脚本外问题按第四节回答。
3. 按第六节验收点和七个诊断分类记录观察，得出步骤 1 要求的「有来源的最小修改清单」。
4. 每族修复被验收后，才在未经调优的候选上运行对应预留案例。
5. Root 负责最终验证与 commit；本轮未 stage、未 commit、未安装、未调用 provider。
