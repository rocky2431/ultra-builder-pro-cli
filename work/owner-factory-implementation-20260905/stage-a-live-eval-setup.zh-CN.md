# Stage A 实际旅程环境与执行记录

本文件由 Codex 维护。输入来源是冻结的 scripted Owner 消息；执行者是真实 ZCode。没有真人驾驶测量，不报告真实 Owner 时间或普遍生产率收益。

## 冻结与隔离

- 基线源：`/tmp/ubp-base-vnn5tbxv`，commit `2e3273bf12f6493b3201fad3d9d1b802ae367a4f`。
- 测试根：`/tmp/ubp-owner-journeys-ynsz0724`，原生 Host 把 cwd 规范化为 `/private/tmp/...`。
- 使用现有 `adapters/zcode.js::install` 生成隔离安装件，configDir 在测试根下；没有安装到真实 HOME。Skill adapter 会规范化 frontmatter 后的空白，因此绑定源文件与**由冻结源生成的安装件**各自摘要；不能把允许的转换误判为源码漂移。
- 实际 Host：ZCode 0.16.5，`/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs`；Node `/Users/rocky243/.hermes/node/bin/node`。现有配置模型 `builtin:bigmodel-coding-plan/GLM-5.2`；后续核对实际 session 模型。既有凭据正常使用，没有复制、展示或持久化新凭据。
- 初次 native discovery 发现同名 inline 插件去重优先保留真实 HOME 的 5.0.1，临时副本被忽略。未在这种错误装载下启动旅程。
- 随后只将隔离安装件的 manifest `name` 改成 `ultra-builder-pro-owner-eval`，临时项目 `.zcode/config.json` 禁用 `ultra-builder-pro@inline`、启用新测试 ID。原生 discovery 确认旧版 enabled=false/skillCount=0，新副本 5.0.2 enabled=true/skillCount=14，无 duplicate ID。前后 discovery 与 namespace 摘要在测试根保存。
- 此命名调整是两组共用的评测包装条件；Skills/Hook 代码未改。它不证明真实 HOME 升级与安装健康。其他原有 Host 能力保持一致；cwd 与插件路径隔离也不是 OS sandbox。

## 调用与续轮

- 初轮通过正常 `agent-delegate run --to zcode --caller codex` 发出，1800 秒上限，保留正常 Terminal/工具。只允许当前临时产品写入与本地验证，无 nested Agent、commit、依赖安装、发布、真实配置或身份效果。
- Operator setup 仅给工作流选择和授权/隔离边界，不提供产品答案；每次只发送当前冻结 Owner 消息，不向模型展示未来轮次或对照结果。
- A/B/C 每条旅程新 session；B 使用同组 A 的文件产物，不能继承其聊天。旅程内部须恢复同一 native session，保留 caller chain 和原始记录。通用 wrapper 目前只有 stateless run；本机 native CLI 提供 `--resume`。已读取 bridge 的 load_session 源码：其注册新 UUID 而 LoadSessionResponse 不返回该新 ID，不能据 advertise load_session 就认定 ACP 恢复合格。续轮使用受支持的原生 operator resume 时须单列 transport；不能把多次无上下文调用冒充同一会话，也不将 native resume 当 ACP resume 资格。
- A 初轮 native session：`sess_c2463f27-3135-497b-80cb-72a10faf175c`；C 初轮：`sess_95e59d92-1b4b-4d10-8238-0fe7a56bd925`。这些只是正在运行的会话标识，未构成结果。
- 候选必须在 repair 返回和 delta Review 后冻结，再生成独立安装件与相同环境。不将运行中的源码当成冻结候选。

## 当前结果边界

基线 A/C 初轮已启动，尚未形成完整三类产品旅程或体验结论。具体 receipt、模型来源、实际 Skill 加载、各次问题、产品命令、失败/中止和成本未知项在返回后追加。Stage A 未通过，尚无阶段提交。

## Journey B 已提交产物起点（两组同条件）

2026-09-05 03:30 UTC。A/C 的零提交设置保留了 strict Review 必需 HEAD 的限制。B 的定义是已交付产品上的连续迭代，因此在各组 A 实际产物由 Codex 独立验证后，由 Codex 对隔离 B 副本创建一次输入快照 commit，再启用 fresh ZCode session；两组规则一致。它不追认未决 North Star，也不回写 A/C 的失败/遗漏，不改变冻结 Owner 消息。Worker 仍不能提交或修改现有回归断言，新覆盖单独添加。

基线 B 起点 commit：`ac0b4fd5914dcfd1a0e46e51657cd19a8e0f8574`，原 A 回归文件 SHA-256：`927a382c50506dc191d97596b72b247d815492b0205482680a777d5626cbd0a1`。设置完整记录在测试根 `baseline-B-start-manifest.json`，候选 B 按同样操作生成。该输入快照是测试材料，不是 UBP 阶段 commit。

候选 A turn 1 在既定 1800s 上限返回 error（`16c670fcd010469fb9dc6ba2aef39cab`，1801.29s），中止记录和产物保留。确认原 native PID 95251 的 `kill(pid,0)` 为 ESRCH 后，才对原 session 发送冻结 turn 2；没有重跑 turn 1 或替换输入。

候选 B 以相同方式建立输入快照：`cacedffadb6770ac923f26d9ad2a32e8506fc3cd`；原 A 冻结回归 `test_recipe.py` SHA-256 为 `dd2e0f5449caa542f618ecc016aff23dd2f3923d50d4faefaa370303db03a509`。独立 21 tests 与实际跨进程 add/list/name-only search 已通过；源实现未由 Codex 编写。
