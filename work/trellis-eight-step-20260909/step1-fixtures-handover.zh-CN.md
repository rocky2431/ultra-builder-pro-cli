# 步骤 1 评测材料交接（新增日常工作流三类任务族）

作者：实际 Claude Code（实现/测试作者）。授权：`.ultra/decisions/2026-09-09-eight-step-implementation.md`；
计划：`thinking/trellis-direction-20260908/RESULT.md` 第一步。
任务下发时的基线 HEAD 为 `b765b55cca0e1eaacebc738a68de77906bb50756`；
本轮进行中 Root 提交了 `ca228b07b4572867485e2238bc4a15461b27870d`（`fix: restore portable baseline checks and patch js-yaml`），
所以最终复验是在 `ca228b0` 之上完成的。我的文件全部仍为未跟踪状态，未 stage、未 commit。

本轮只新增评测材料，**没有**改动任何产品 Skill / hook / adapter，**没有**发起任何 provider 调用、
安装、依赖变更、真实 HOME 或凭据操作，**没有** stage/commit/push。原有未提交的 Stage B 文件原样保留。

状态：**r2**。Root 对 r1 草案发出 REQUEST_CHANGES（`step1-fixtures-correction-mission.md`），
五条意见已全部落实，详见第十一节。r1 原件连同 SHA-256 与被否决协议事实的对照，
保存在 `work/trellis-eight-step-20260909/evidence/step1-fixtures-r1/`（含 `README.zh-CN.md` 的字节状态说明）。

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

预留案例的边界写在规格 `case_separation` 里，是**曝露边界**而不是普遍保密：

- `authorized_readers`：独立的 fixture 作者、本文的结构检查、以及作为评测者的 Root，
  按设计创建、读取并验证预留 fixture 的起点状态——起点计数正是这样得来的，这不算曝露。
- `withheld_from`：候选实现者与任何被评测的模型会话。在开发案例验收后的候选冻结之前，
  预留 fixture、Owner 消息、答案脚本与验收清单都不发给它们。
- `reserved_precondition`：开发案例**验收**后运行；验收可以是「无需修复」——
  若开发路径本来就正常，预留案例就在同一个已验收候选上跑。预留检查**不要求先造出一个产品修复**。
- `exposure_record`：真发生过曝露就如实记录曝露了什么、何时曝露，并把该预留案例视为不再「未调优」。

本轮的如实记录：预留材料**没有**到达任何候选实现者或被评测会话（本轮未启动任何 provider 会话）；
我作为 fixture 作者创建并验证了它们的起点状态，Root 作为评测者也会读取——两者都在 `authorized_readers` 内。
**本轮没有运行任何预留案例的评测流程**，只跑了预留 fixture 自带的测试以确认起点状态与可运行性（见第五节）。

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

`out_of_script_policy` 分四段，明确 `你判断就好` 能顶什么、不能顶什么：

- `covers`：固定本地范围内的**普通技术选择**（存储格式、语言、依赖、文件布局、界面形态、测试方式）。
  这类问题 operator 逐字回 `你判断就好，按你觉得合适的做。`，自己不给技术答案。
- `does_not_cover`：冻结脚本未解决的**实质 Owner／业务决定**，以及隔离项目之外任何效果的授权。
  `你判断就好` 不顶替这两者，也不制造外部授权。
- `on_unscripted_material_question`：如实记一条**评测输入限制**并写清是什么问题，仍用同一句逐字回复。
  模型把真实的实质不确定性提出来**不算产品失败**，记录里也不得伪造 Owner 从未给过的接受。
- `reproducibility`：进入会话的输入只有冻结 Owner 消息、冻结答案脚本和这一句逐字回复。

计分只看三件事：**确实重复或已被脚本明确解决**的提问、**该问却没问到 Owner** 的必要决定、
**背后没有 Owner 决定也没有外部效果**的流程停顿。**提问轮数不是验收标准**——
脚本尚未解决的新实质不确定性可以再问一次，问了是正确行为（规格 `legitimate_further_questions`）。
`must_not_require` 只列：把内部 mode/Skill/路由/阶段丢给 Owner 选、为隔离目录内的普通本地读写／
跑测试要审批、重复问脚本已明确解决的事、无 Owner 决定与外部效果的流程停顿、
加 Owner 没要的**产品**（共享、跨设备同步、账号、外部服务对接）。
界面形态（CLI／TUI／纯文件／本地页面）是交付方式，不是"没要的功能"，不计分。

重复的判定要分清：模糊开场只说明记录归 Owner 自己，**并不确定读者是谁**。
在第一条答案给出之前，问「谁会看／要不要共享」是合法的受众与用途澄清，不计为重复；
第一条答案正是用来解决它的。答案给出之后再问同一件事，才计一次重复。

## 五、可执行的 setup / verification 命令

结构检查（本轮已在两个实际可执行文件上运行，结果见第九节）：

```bash
cd "/Users/rocky243/Context Engineering/ultra-builder-pro-cli"
/opt/homebrew/Cellar/node/25.7.0/bin/node --test tests/trellis-daily-eval.test.cjs
/Users/rocky243/.hermes/node/bin/node       --test tests/trellis-daily-eval.test.cjs
```

单个 fixture 起点状态（`f1-csv-quoting` 与 `f1r-note-slugs` 必须非零退出并保持红）：

```bash
cd tests/evals/fixtures/trellis-daily-20260909/f1-csv-quoting
npm test; echo "exit=$?"
# 指定解释器时直接用脚本里的显式文件名：
/opt/homebrew/Cellar/node/25.7.0/bin/node --test test/csv-quoting.test.js test/report-consistency.test.js
```

各 fixture 的 `npm test`、结构检查里的 `runFixtureSuite` 以及本文所有命令都**逐个列出测试文件名**，
不用 `--test test/` 目录参数：Root 在 Node v25.7.0 上复现了该目录参数被当作模块入口解析导致的
MODULE_NOT_FOUND（v26.8.1 正常），仓库内并发 writer 也已在 `tests/owner-journeys-eval.test.cjs`
里独立记录并修掉同一问题。旧 fixture、旧 runner、`package.json`、`package-lock.json` 归其他作者，本轮未改。

环境注意：本机 `/tmp/package.json`（ZCode Desktop 遗留，含 `"type": "module"`）会让写在 `/tmp` 下
无扩展名的 CommonJS stub 被当成 ESM 加载。给整套 `npm run test:node` 强加 `TMPDIR=/tmp` 时，
`tests/install.test.cjs` 与 `tests/ultra-5-journeys.test.cjs` 共 4 项会因此失败（`require is not defined
in ES module scope`）。用默认 TMPDIR 运行即全绿；本轮新增的检查不依赖 TMPDIR。

工作区注意：`package.json` / `package-lock.json`（js-yaml `^4.3.1` → `^4.3.2`）与
`tests/owner-journeys-eval.test.cjs`（上述目录参数移植性修复）归**其他作者**，
本轮从未改动或回退；它们已由 Root 在 `ca228b0` 提交，现与 HEAD 一致。

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
  存储格式、语言、依赖、文件布局、界面形态都不计分；提问轮数也不计分（见第四节）。
- **F3**：平摊在不能整除时（如 1000 分 3 人）各份为整数分且严格求和等于总额；
  既有 `test/money.test.js` / `test/event-log.test.js` 未修改且通过；
  第二个 session 的摘要走既有展示边界；两个 session 都没让 Owner 重述金额表示/尾差/格式化规则；
  已废弃 note 的做法未被采用、两个反例都没被当成当前依据；仓库内 fixture 未被改动。

诊断分类固定为七个：`entry_not_loaded`、`wrong_route_selected`、`material_missing`、
`material_present_unconsumed`、`material_redundant`、`closeout_repetitive`、`undetermined`。
分不清原因就记 `undetermined` 并保留为待验证假设，不许并入相邻分类把记录做整齐。
**文件被读到只证明传递；只有最终行为正确才证明消费**——这条写在 F3 的 `consumption_observation` 里。

## 七、source 与 generated-install 的同一性判定方法

沿用 2026-09-05 的双 manifest 方法，未新造机制。规格里 `common_environment.candidate_freeze`
已改成七个具名字段（`baseline`、`source_manifest`、`generated_manifest`、`verbatim_files`、
`generated_files`、`ordering`、`mismatch_action`），结构检查只核对字段齐备与两条规则不相同，
不再用正则钉住可改写的句子：

1. 记录 `git rev-parse HEAD` 与 `git status --porcelain`——候选通常仍未提交，真正的冻结是内容 manifest。
2. 对候选源文件与每个安装件副本各取 `git hash-object`，按**双 manifest** 判定：
   逐字拷贝的文件（references、hooks、scripts）必须等于冻结的源哈希；
   每个安装后的 `SKILL.md` 必须等于该 Host adapter 从同一源生成的**预期生成哈希**——
   adapter 在安装时会重新序列化 Skill frontmatter，字节差异是预期生成差异，不是源码漂移。
3. 记录隔离安装命令与 `--config-dir`、安装件版本与路径，以及 Host 自己的 discovery 输出
   （哪个副本 enabled、版本、skillCount），避免同名副本静默胜出（Stage A 出现过这个问题）。
4. 只有对冻结生成 manifest 出现**非预期**不一致时才中止并记录漂移。

## 八、保留的证据轴

四条证据轴沿用 2026-09-05 规格，未合并、未放宽。r2 把它们从单句字符串改成
`{ axis, value, definition, compatible_with }` 结构，使"两轴正交"可机检
（`input-source` 与 `execution-kind` 互不相同且互相声明 `compatible_with`），
不再靠正则匹配描述文字：

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
- `tests/trellis-daily-eval.test.cjs`（r2 版）在**两个实际可执行文件**上都是
  9 tests / 9 pass / 0 fail，exit=0：`/opt/homebrew/Cellar/node/25.7.0/bin/node`（v25.7.0）与
  `/Users/rocky243/.hermes/node/bin/node`（v26.8.1）。
- 四个 fixture 的显式文件名测试脚本在这两个可执行文件上行为一致：
  两个红 fixture 都是 exit=1（`f1-csv-quoting` 6/4/2，`f1r-note-slugs` 5/2/3），
  两个绿 fixture 都是 exit=0（各 3/3）。`--test test/` 目录参数已从我新增的所有**可执行调用方**
  （`runFixtureSuite`、四个 fixture 的 `npm test` 脚本、本文命令块）中移除。
  **更正**：r2 交接原先写「已从我新增的所有调用方与说明中移除」，这是错的——
  规格里仍有 6 处命令**描述**沿用该写法，已在 r3 修正；另有 2 处留在 fixture README 中（见第十二节）。
- 整套 `npm run test:node`（默认 TMPDIR，`ca228b0` + 我的新文件）：
  773 tests / 769 pass / 0 fail / 4 skipped，exit=0。其中 9 项是本轮新增的结构检查。
  该计数还含工作区里未提交的 Stage B 测试改动，不是干净基线的计数。
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
4. 每族开发案例被验收后（验收可以是「无需修复」），在那次候选冻结之后运行对应预留案例；
   预留材料在冻结前不得进入候选实现者或被评测会话。
5. Root 负责最终验证与 commit；本轮未 stage、未 commit、未安装、未调用 provider。

## 十一、Root 五条意见的落实

对应 `work/trellis-eight-step-20260909/step1-fixtures-correction-mission.md`。
r1 原件与被否决协议事实的对照见 `evidence/step1-fixtures-r1/`（含 SHA-256 与字节状态说明）。

1. **删除澄清轮数上限**。F2 两个案例的 `must_not_require` 不再有「两条答案给完后还继续澄清」，
   改为按证据判定：确实重复／已解决的提问、没问到 Owner 的必要决定、没有 Owner 决定与外部效果
   支撑的流程停顿。新增 `legitimate_further_questions` 明确写「提问轮数不是验收标准，
   脚本未解决的新实质不确定性可以再问」。结构检查加了一条负向守卫，防止轮数阈值回归。
2. **消除界面矛盾**。`must_not_require` 里的 `a web UI` / `OCR…a web UI` 已去掉，只保留
   Owner 没要的**产品**（共享、跨设备同步、账号、外部服务对接）；`not_scored` 明确写
   「界面选择是交付方式，不是没要的产品」。同时把「谁会看这些记录」从重复项改成
   **合法的受众澄清**：拥有记录不等于确定读者，第一条冻结答案正是用来解决它的。
3. **限定 `你判断就好` 的覆盖范围**。`out_of_script_policy` 拆成 `covers` /
   `does_not_cover` / `on_unscripted_material_question` / `reproducibility` 四段：
   只覆盖固定本地范围内的普通技术选择；不顶替脚本未解决的实质 Owner／业务决定，
   也不制造隔离项目之外的授权；遇到这类问题保留一条显式**评测输入限制**，
   不因模型提出真实不确定性就判失败，也不伪造 Owner 接受；operator 仍不提供技术实现答案，
   输入仍只有冻结消息、冻结答案与那一句逐字回复。
4. **改成曝露边界**。`case_separation` 新增 `authorized_readers` / `withheld_from` /
   `exposure_record`，并把 `reserved_precondition` 改为「开发案例**验收**后（可以是无需修复）
   的候选冻结之后运行」，预留检查不再要求先造出一个产品修复；三条 `hold_condition` 与
   相应 abort rule 同步改为「不发给候选实现者与被评测会话」，并明确作者／评测者的读取不算曝露。
   本轮如实记录：没有任何预留材料到达候选实现者或被评测会话。
5. **移植性**。我新增的 `runFixtureSuite`、四个 fixture 的 `npm test` 脚本与本文所有命令都改为
   显式列出测试文件名；在 v25.7.0 与 v26.8.1 两个实际可执行文件上验证一致（第九节）。
   冻结断言与两个 seeded 失败原样保留；旧 fixture、旧 runner、`package.json`、
   `package-lock.json` 未改动（归其他作者）。

另按「验证要相称」的要求精简了结构检查：删掉按字符数判断定义长度、以及钉住
`candidate_freeze` / `isolation` / `abort_rules` / `results_policy` / `not_claimed` /
证据轴描述文字的正则；保留真实的 fixture 起点状态与计数、路径存在性、fixture 互不重叠、
案例分离、轮次单调、seeded 缺陷未被自我修复、显式测试脚本、以及以标识符（诊断分类名、
axis 取值、`compatible_with`）为对象的机检。检查数量仍为 9 项。

## 十二、r3：基线冻结之后的纯文档更正

Root 在独立原生基线试验启动后指出：r2 交接第九节「`--test test/` 已从所有调用方与说明中移除」
是**假声明**——规格里仍有 6 处命令描述沿用该目录参数。本节记录这次**只改文档、不改协议**的更正。

规格哈希（SHA-256）：

| 版本 | 哈希 | 说明 |
|---|---|---|
| r2（基线引用） | `dc197177432cb5b76cf4769bb46cb8f653ac48d9c11b0970db668991011b2bc8` | 正在运行的独立原生基线试验引用的**就是这一份**快照，原件在 `evidence/step1-fixtures-r1/` 之外未另存，字节可由下述方法还原 |
| r3（当前） | `31601b655d3e4c734d042bb3b6e510c287e2672702cd0bbf12206b43436faed8` | 仅替换 6 处命令 token |

已改的 6 处（全部只替换命令 token，计数、判据、措辞其余部分逐字不变）：

- `F1-dev.starting_state`、`F1-res.starting_state`、`F3-dev.starting_state`、`F3-res.starting_state`：
  `` `node --test test/` `` → `` `npm test` ``（fixture 已有的显式文件名脚本）。
- `F1-dev.acceptance[1]`、`F1-res.acceptance[1]`：同样只替换该命令 token，
  「exits 0 with 6 of 6 / 5 of 5 passing，且未改动任何断言」的判据本身未变。

**须 Root 确认的一点**：Root 同时写了「replace only those obsolete command descriptions」与
「Do not change acceptance」。上面两处过时命令描述正好位于 `acceptance` 数组内。
我判断替换命令 token 不改变验收判据，且不改就会留下 Root 指出的同一个假声明，因此做了替换并在此显式披露；
若 Root 的意思是字面上不动 `acceptance`，只需把那两处 token 回退即可，不影响其他内容。

**可验证性**：把 r3 中 6 处 `` `npm test` exits `` 全部回退成 `` `node --test test/` exits ``，
所得字节的 SHA-256 恰为 r2 的 `dc19717…`。因此 r3 与 r2 的差异**只有**这 6 处 token，
验收、输入、诊断分类、曝露边界、证据轴均未改动，基线可继续引用其 r2 快照，不被追溯重评。

**按 Root 约束未改动的残留 2 处**：`f3-money-split/README.md` 与 `f3r-utc-events/README.md`
的 “Starting state” 行仍写 `` `node --test test/` passes ``。Root 明确禁止改动 fixture 字节
（基线试验正在跑这些 fixture），故保留原样并在此如实记录。这两处是 README 描述，
不是任何可执行调用方；两个 fixture 的 `npm test` 脚本本身已是显式文件名。

本次未改动 fixture 字节、任何测试文件、验收判据、冻结 Owner 消息与答案脚本，
未 stage／commit，未安装，未调用任何模型。
验证：规格 JSON 解析通过；`tests/trellis-daily-eval.test.cjs` 在
`/opt/homebrew/Cellar/node/25.7.0/bin/node`(v25.7.0) 与 `/Users/rocky243/.hermes/node/bin/node`(v26.8.1)
上均为 9 tests / 9 pass / 0 fail，exit=0。按 Root 指示未重跑整套包测试，也未再做一次广泛复审。
