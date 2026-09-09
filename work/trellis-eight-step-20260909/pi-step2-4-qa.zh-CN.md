# Pi 独立 QA：步骤 2 与 4

日期：2026-09-09

## 结论摘要

- **步骤 2：BLOCKED（未宣称整体通过）**。候选 5 的参数边界窄验证已通过；F2-res 的目标确实进入 native Claude 会话，但该真实会话被 weekly429 阻断，不能据此完成同 Claude 会话续接验收。
- **步骤 4：BLOCKED（未宣称整体通过）**。D1、D2 的样例行为本次由 Pi 在解压后的副本中独立操作并通过；D3 的既有证据及本次分账直接 API 操作通过；D4-r2 确实中断且后续确认残留进程清理完毕，但 resume 最终被 429 阻断，仍没有完整 recovery verdict。
- 本次未改 Ultra 实现、测试、fixture、状态或 authority；未发起 live Claude/provider 调用；未提交。

## 范围、来源与 artifact 选择

已阅读：`AGENTS.md`、`step2-acceptance.zh-CN.md`、`step4-current-observation.zh-CN.md`、`step4-evaluation.zh-CN.md`、`step2-candidate5.json`、`step2-candidate4.json`、`step2-4-current-evidence-index.json`、当前 delivery state `docs/wip/ultra-builder-pro-vnext-three-stage-delivery-state.zh-CN.md` 前 50 行，以及 `.ultra/decisions/2026-09-09-root-independent-implementation.md`。

- 最终入口实现选择 **candidate5**：源 `/var/folders/cm/zpwxmr512rq1qz4_0_ryz8t80000gn/T/ubp-final-entry5-08rm2b0_/source`，patch SHA-256 `122667aa8a08c3382277bca432add5cf0eba825e059ff2eeeb69f225bde7602a`，安装插件 `/var/folders/cm/zpwxmr512rq1qz4_0_ryz8t80000gn/T/ubp-unified-entry-trial-04yth2n1/claude-config/skills/ultra-builder-pro`。candidate4 是前一轮；candidate5 只新增 native argv `--`，不是新样例产品。
- 样例最终 artifact 按 evidence manifest 选择：会议记录为 `D1-owner-operation-clean-04yth2n1` / `D2-range-04yth2n1` / `D4-interrupt-r2-04yth2n1` 中的 `mnotes.py`；分账为 `D3-workspace-04yth2n1/money-split`。F2 初始开发产物 `F2-public-turn1-04yth2n1`（`meetnote.py`）与后续候选/交互记录不混作 D1/D2 的最终 artifact；F2-res-candidate5 是后续入口恢复尝试，不是已交付产品结果。
- 原始证据已只读解压到 `work/trellis-eight-step-20260909/pi-step2-4-qa-evidence/archive/`；源文件和测试 hash 未改。

## Pi 实际独立操作

临时副本：`/tmp/pi-qa-2EFzq1`。完整 stdout/stderr：

- `pi-step2-4-qa-evidence/qa-notes-operation.txt`
- `pi-step2-4-qa-evidence/qa-range-operation.txt`
- `pi-step2-4-qa-evidence/qa-split-operation.txt`

### 会议记录 / 持久化 / 关键词 / 日期

基于 README 的公共命令，未读实现源码操作：

```text
(cd /tmp/pi-qa-2EFzq1/notes && python3 mnotes.py add -d 2026-09-10 -t QA验证 -m '决定：Pi独立操作；预算周五复核。')  => exit 0, #2 2026-09-10
(cd .../notes && python3 mnotes.py find Pi)                         => exit 0, 命中且显示 2026-09-10
(cd .../notes && python3 mnotes.py find 预算)                       => exit 0, 新旧两条均命中并显示日期
```

`find` 是独立的新进程；数据库实际为副本中的 `data/notes.db`，没有 mock/stub。`python3 -m unittest test_mnotes -v`：**25 tests，exit 0**。

第一次临时尝试在 D1 副本执行 `list --since/--until`，但 D1 README 没有该新接口，命令 exit 2；这是 Pi 误把 D2 的后续 README 用在 D1 的无效输入，不是产品失败，已原样保留。随后使用 D2 的 README 和独立副本正确执行：

```text
add 2026-09-01 / 2026-09-05 / 2026-09-09                 => 三次 exit 0
list --since 2026-09-01 --until 2026-09-05               => 端点均含，3 条，按新到旧
fresh process list --since 2026-09-05 --until 2026-09-05 => 仅 2026-09-05，1 条
python3 -m unittest test_mnotes -v                       => 35 tests，exit 0
```

因此 D1 的原始用途（录入、关键词找回、看到日期、跨进程持久）**PASS**；D2 的时间段端点过滤、跨进程与原目的不退化 **PASS**。这只是 Pi 对样例产品的操作观察，不是真人可用性研究。

### 分账 / 整数分 / 展示边界

基于 `money-split/README.md` 和 `package.json` 的公共入口，未修改任何文件：

```text
npm test                                                        => 21 tests，pass 21，exit 0
node direct public API checks:
  splitAmount(1000, 3) => [334,333,333]
  addAmounts(shares)   => 1000
  formatAmount(1000)   => "10.00"
  summarizeSplit(...)  => 合计 10.00，3 人平摊：1 人 3.34，2 人 3.33
  splitAmount(-100, 3) => [-34,-33,-33]，sum=-100
  splitAmount(1000, 0) => RangeError：平摊至少需要 1 个人，收到的是 0
```

D3 的分账行为在本次公共 API 操作下 **PASS**；既有 `test/money.test.js` hash `e31293...58a428` 保持不变。本次未重新声称 D3 完整任务切换链；该部分仅引用 evidence 中已有的三回合记录。

## D4-r2 中断/恢复检查

**状态：BLOCKED / UNTESTED（完整恢复判据）**，不是 PASS。

仅检查既有纠正证据：`archive/trial/D4-interrupt-r2-observation.json`、`D4-resume-r2-process-result.json`、`D4-interrupt-r2.stdout.jsonl`、`D4-resume-r2.stdout.jsonl`。

已成功的部分：

- P1 是真实 `tool_result`，之后 dwell `10.004657790996134s`。
- 对公共命令进程组只发出一次 `SIGINT`；父命令 exit code `-2`。
- 停止瞬间确实观察到后代残留；这不是“没有残留”的假设。
- 后续 settle 检查 `ps_exit_code=1`、无输出，`all_residuals_gone=true`：真实进程清理最终确认完成。
- 保存了停止前项目 manifest、transcript 最后一条记录和中断后原始输出。

仍未验证/未成功的部分：

- `--resume` 同 UUID 的后续真实工作没有完成；`D4-resume-r2-process-result.json` 为 exit 1、约 174.62 秒，最终 provider 返回 weekly429。
- 因此没有证据证明被请求改动恰好一次、停止前半成品没有丢失、D2 原始目的在恢复后仍成立，也没有完整“做到哪/有没有半成品”对照。
- 不能把已有 **34 项自验**当成 recovery verdict；它只证明作者在本地检查过，不能替代被 429 截断的真实续接。
- 该形态是 `-p` 无 PTY；终端可用提示符不能被声称为已观察。`SIGINT`/后代行为首先是 native 非交互运行环境观察，不直接归因 Ultra 缺陷。

## F2-res 与 launcher argument boundary

- `root-argv-boundary-green.log`：11 项窄测试全部通过，包括 variadic `--allowedTools` 之后 prompt 仍保留、resume/continue 继续携带插件。
- `F2-res-public-candidate5-request.json` 的实际 native args 中，`--allowedTools Bash` 后明确有 `--`，目标原样仍在最后；`native_launch` 记录了同样的 argv。
- `F2-res-public-candidate5.native.jsonl` 显示目标已进入 native session；但结果状态为 `blocked-native-weekly-limit429`，并记录恢复时间。没有进行新的 Claude 调用。

判断：当前残余不是已证实的 provider 以外 implementation 缺陷；candidate5 已修正被 variadic 参数吞 prompt 的公共入口边界，公共入口支持由窄测试和“目标到达 host”得到证据。**provider 行为（weekly429）阻断了 F2-res 的产品验收**，且本 QA 不能伪造同一 Claude session 的 continuation。是否在额度恢复后继续属于后续 Owner/Codex 决策。

## 缺陷与限制分级

- **P0：未发现（本范围）。**
- **P1：未发现可归因于 Ultra 实现的确定性缺陷。** 但 F2-res/D4-resume 是 **BLOCKED**，不可作为通过；weekly429 是验收阻断条件，不是已定位的产品 bug。
- **P2/P3 记录：**
  1. 样例工具对不同日期、相同正文的手工记录存在判重限制；既有材料明确记录，未修复、未改判。
  2. 本次第一次时间范围命令用错 D1 README，已标 invalid operator assumption；D2 正确 README 的实跑通过。
  3. D4 使用无 PTY 的 `-p`，不能证明交互提示符状态；残留进程曾短暂存在但后续已确认清理。
  4. F2 初始批处理曾漏问实质用途；后续交互 F2 与 candidate5 argv 证据不能反事实修复或覆盖那次失败。

## 未做与边界

未读私人资料、未联网、未使用凭据进行 provider 试跑、未改产品代码/测试/fixture/README/状态/authority、未运行整套 release suite、未进入 Stage B、未增加 Pi 支持、未创建 worker、未 commit。临时 `/tmp/pi-qa-2EFzq1` 仅为 disposable copies；可删除。
