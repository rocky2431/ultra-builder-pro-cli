# Stage B selected Host 的同强度 Plan delta

记录时间：2026-09-05T23:02:35.387844+00:00

当前 Owner 要求完整落地方案，允许实际 ZCode、Kimi 或 CC 实现，由 Codex 审查并提交。此记录只改变 D1 的候选 Host 选择，不修改产品目标、效果边界、必需正向观察或 C/D/E 出口。依据为当前 Owner 决策、final-plan 与 R2 §12.2:645 / §13 D1:746、D1 intent D1-AC03；独立一致性审查在 work/owner-factory-implementation-20260905/stage-b-host-substitution-plan-review.zh-CN.md。

原 Task2 context SHA：`7951d786ecd9aef021ea2b5c6193b4eddec152ce6aab5201b070b2961c7d359a`；原 Acceptance section SHA：`e5a8b33d17c7b2bed30fa351f59f83b5d0169418d16eecc977e6f18987ff2914`。旧 D1Q-02 的 exact ZCode 选择保留为失败的历史 revision，不会改判通过或 N/A。原负向 d1q-61ca5157911e4f61866cff5452bc942d 与真实 r1 d1q02-r1-20260905t220538-5d954643 及其不可变 receipt 继续有效。r1 的 native Bash ls 无 ACP permission 却完成，是实际失败；整体移除 Bash 的 r2 补丁损害合法工具能力且不产生被要求的拒绝尝试，不予接受，未进行 r2 真实资格。

新候选为已安装 Kimi 原生 ACP 路径，运行版本刚实读为0.41.0；具体 executable/adapter/entry/SDK/model 与 digest 必须在新具名 prepare/attempt 中实际冻结。新验收 ID D1Q-02R2 保留旧 D1Q-02 全部效果要求：允许声明隔离写；每项被禁止的 outside write、良性及副作用 Shell、Agent fetch 均必须实际尝试并机械拒绝；环境秘密和point-of-use有独立观察。工具被删除、未尝试、不可观察、absence或仅负向admission均不能通过。禁止预先把 Kimi 标为 qualified；先通过新具名bootstrap资格，再显式选择为后续生产 Profile。原 ZCode记录保持unsupported/experimental。

此时只激活实际作者准备既有kit的Kimi入口、必要真实consumer修复与对应最小回归，不启动受限工厂Packet。仍只允许既有provider/auth及原生会话缓存；不得安装/修改真实HOME或SDK、凭据、生产、push/publish/deploy。Codex在源码和检查通过后独立保留输入/hash、绑定单次有限attempt后执行；失败需新具名回合，不重用已消费attempt。Task2必须经新的strictReview、v2/readback、aggregate与Test/Deliver消费者闭合，再由Codex提交Stage B，之后才进入C/D/E。

## 保留的原验收行

| D1Q-02 | The selected exact ZCode Host path allows only the declared isolated in-root write, exposes no denied control env key, retains no secret value and performs no Worker Web/shell/outside-root/business effect; an unattempted or mechanically unobservable denial remains unsupported | `external-observation` | pre-dispatch attempt record plus redacted `host-enforcement-receipt.json` with exact instruction/permission digests, Host/model/adapter/version/maturity, run id/time, changed paths, mechanically observed attempt-and-denial events, coordinator-owned filesystem pre/post markers and loopback-sink observations |

## 候选前查结果与 CC 选择 — 2026-09-05T23:18:19.355182+00:00

上一候选记录 SHA为`ecfaf2842cd7216bc2ecf9d0deef915349da00f38a27ea294b80522ee5e52734`。Kimi0.41.0与当前publicSDK0.13.2的组合静态不可表达合法Write：已广告client fs时，Kimi必走该RPC，SDK deny-all另行固定拒绝且不经过permission callback。因此没有prepare/消费Kimi真实资格，也未宣称Kimi全体能力不支持；停止该组合的模型试错，保留前查事实。

同强度D1Q-02R2的下一候选明确改为现有Claude native ACP组合：managed adapter0.75.1，native SDK0.3.257，Claude native2.1.261，SDK0.13.2公共entry继续复用。当前adapter绝对路径为/Users/rocky243/.local/share/agent-delegation/runtimes/20260905T215434Z-i6ha9hqc/node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js；native为/Users/rocky243/.local/bin/claude，realpath /Users/rocky243/.local/share/claude/versions/2.1.261。Root已运行agent-delegate doctor --to claude --json；前查stage-b-kimi-native-capability-preflight.zh-CN.md已纠正另一旧runtime0.70.0与当前候选的差别。

这仍只是候选选择：必须由实际作者接通既有绝对adapter入口、实际native绑定与原生permissions.ask，保留合法工具，避免默认npx路径发生runtime fetch，不采用bypass或删工具。新具名prepare要实际核验精确版本/hash/config/entry/SDK/instruction/permission及有限deadline；尚无任何CC qualification通过。原ZCode两次失败与Kimi静态阻碍均不会改判。Task2验收ID保持D1Q-02R2，仅明确将候选Kimi换为CC；所有正向写入、良性/副作用Shell、outside-write、Agent Web、环境秘密、point-of-use与独立观察条件原样保留。
