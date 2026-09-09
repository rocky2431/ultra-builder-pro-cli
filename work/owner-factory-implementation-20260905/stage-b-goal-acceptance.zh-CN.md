# Stage B 目标工程分项验收

Codex 接受 Kimi 的目标工程分项修改。UBP/ACP/D1 的 Stage B 整体仍未通过；此处不宣称工厂运行或宿主无人值守已经完成。

实际作者回执 `148641921e0844158def3a8ec12858dc`：success/end_turn，1572.537s，原生 session `session_2ba49b6d-9aad-47b7-bd52-e36897ad2d6a`。961 个可选 policy 文件读取的 tool-scoped 错误保留，protocol errors 为0；这些错误不覆盖产物复验。工作树为 `/tmp/ubp-factory-stage-b-l7dd0y3s/ultra-goal-skill`。

修改完成了已接受方案的三个实际消费者：graph/loop 的固定/动态概念及成本证据口径；现有 agent-delegation 命名会话、观察与取消能力的版本化表述；SAME_VENDOR_REVIEW 的 advisory 行为。Goal 的批准身份、独立 session、当前输入摘要、验收覆盖、必需 Review 与 Anchor 完成路径未被弱化。`workflow-script.js` 保持特定 runtime 附件，未伪装成已提供的通用执行引擎。

独立源码审查见 `stage-b-goal-independent-source-review.zh-CN.md`。Root 在 Kimi 基线21495b6上运行441项全量测试，exit0，31.147s；官方 Skill Creator 对前后完全一致的 when_to_use frontmatter 均返回不兼容，明确保留该既有兼容性限制，不能称官方 validator 全部通过。

原 Goal checkout 另有已提交的2.15.2安装路径和Hook测试修正（6551e4ccbe1f967799e9dbb50f2bce62b5cb5ffb）。Codex仅通过Git合并这些作者已有字节，未写实现或测试：对我们明确的八源/测试及交接日志执行具名stash（4e525c74bdf895da7f229d85613f11c6d19818f9），工作树fast-forward到6551e4c，再按精确stash恢复。无冲突；七文件字节完全相同，SKILL只保留2.15.2 metadata版本，正文与Kimi审查字节相同。原checkout及其四份未跟踪研究资产未改。

整合后同一独立完整命令 `python3 -m unittest discover -s tests -v` exit0，444项中443通过，1项因本机无原生Windows cmd.exe跳过，35.007s；diff check通过，全部八文件测试前后SHA不变。源比较与完整结果在ignored runtime的 `stage-b-goal-integration-source.json`、`stage-b-goal-integrated-tests.json` / `.log`；最终Skill SHA `fb7a444574f6b04ee724f65d3f65481d44f271b6888ff48a7a1804748319dd3b`。旧441项日志与原交接哈希是历史输入，不冒充整合后结果。

保留P2：README/ACCEPTANCE_ORDERED的旧例子措辞；现有when_to_use兼容性；JSON声明不能自行认证实际Review独立性。没有因这些记录扩大源码范围。未执行真实workflow runtime或新的跨Host生命周期资格，未安装、提交、push或发布。分项保持待Stage B完整验收后的统一commit与安全合入。

## 独立 2.15.3 更新后的整合复验

原 checkout 后续推进到 `ce41e775a83cfe2d8adad53d4eaa62dce80472c9`，包含已提交的 2.15.3 metadata 与 Windows Hook 命令修正。Root 在无 Goal writer 时具名 stash、fast-forward 后恢复修改，未写实现或测试，且无冲突；备份 `a50e881320e9ab93638551e4ae78af5cfb9498c6` 保留。当前相对新基线仍为原八文件 156 行增加、56 行删除，独立修改不归功于本任务。

独立全套复验 444 项（443 pass、1 原生 Windows 专用 skip），exit 0，43.875s，八个受检文件前后 SHA 相同。日志 SHA-256 `981fcc82da9b6fe1657c2255c2d9bbda9fadad24409d2ef81d92c12a88632d9e`；当前 Skill SHA-256 `ba9a24fa78ba1ad47dad377a2cb829530ffdc704fe84828957848c72e2a10af4`。操作及检查记录为 `stage-b-goal-2.15.3-integration.json` 和 `stage-b-goal-2.15.3-integrated-tests.json` / `.log`，位于 UBP ignored runtime。分项接受保持有效；Stage B 整体验收及统一 commit、原 checkout 安全合入仍未完成。

## 保留独立 2.15.4 更新后的集成核对

2026-09-06：原 Goal checkout 已有独立 b4777226cd20c62125fe2f9f3acbeda127c110b8（2.15.4）会话绑定 status 提示修复。Root检查其diff后，在任务工作树stash仅八处原任务tracked修改，FF并无冲突恢复，备份 ff9aa2a12e253801d3949036c20938ca8da16718。Root未写任何实现或测试，原checkout的四项未跟踪研究材料未动。当前任务修改继续保留该版本与新增session-binding advisory，不归功为本任务实现。

Root重新运行 python3 -m unittest discover -s tests -v：447项，446pass/1 Windows-only skip，exit0，29.644s；八处任务源SHA前后相同。原始日志stage-b-goal-2.15.4-integrated-tests.log SHA1c8696ba8cd6c388d17945be99989721a3caa1b217e93c60a237ae2cc17ec8b5，Git操作与完整源SHA见同目录stage-b-goal-2.15.4-integration.json和integrated-tests.json。该集成检查支持当前Goal分项，不代表W1–W4或自动化工厂已经运行通过。此前官方Skill validator的既有when_to_use不支持问题仍保留；未修改该无关frontmatter，也未声称此处官方验证通过。
