# Stage B bridge 最终修复与构建身份：独立源码审查

2026-09-06。**本分项未发现剩余 P0/P1，源码审查接受。** 这不构成严格 Task Review、正向 Host qualification 或 Stage B 通过。只读范围为临时 bridge 的完整基线 diff、规范 patch、既有身份消费者与指定维护文档；未运行 Provider、安装、重跑套件、写实现/测试或改状态，只写本报告。

源读取开始 2026-09-05T20:30:52.861338+00:00，结束 2026-09-05T20:35:17.046876+00:00；下表首批 11 项前后 SHA 相同。临时 bridge HEAD 始终为基线 42fe149d4b501469343c01f23ba3801832306d53。

## 已闭合的具体路径

| 对象 | 实际证据与判断 |
|---|---|
| 完整 patch 与旧 compatibility | 只读执行 git diff --binary 42fe149d…，其字节与 UBP 规范 patch 完全相同：8 文件、430 additions/35 deletions，SHA 8c127dba…。原 b765b55 的 compatibility patch SHA 为 174dfd0f…；对当前树执行 git apply --reverse --check，排除意图更新的两个 Cargo 版本行与新增相邻 probe 的 fake fixture 后，原兼容实现检查 exit 0。最初未排除 fake fixture 的 check 因新增邻接行而无法匹配该 hunk，不能据此判断丢失兼容：逐行核对 [fake:124–162](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/tests/fake-app-server.cjs:124)，原 deferred session/create 和四项 runtime preferences 断言完整保留；作者最终真实 binary + fake App-server E2E 也通过该握手。未执行任何 apply 写入。 |
| native file_path 与权限位置 | [translator:148–169](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/acp_translator.rs:148)保留 path/file/files 字符串全部位置，并增加 file_path；scheduled call 第 74 行与 permission 第 215 行共用同一函数。[agent:677–684](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/agent.rs:677)把这些结构化 locations 交给 ACP RequestPermission，同时保留原 raw_input 对象；没有让 UBP 反向猜 raw_input 路径。现有两个 Rust 断言覆盖单 file_path 的 scheduled 和 permission，Python 第 189–203 行覆盖两请求与事件位置。 |
| 多拒绝可分别观察 | [agent:723–755](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/agent.rs:723)对被选 deny 回送原生 deny，并按 tool_call_id 发 failed update，不在此结束 turn。fake 在第一拒绝的实际回复后发送第二 probe；[client:189–215](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/tests/acp_client.py:189)要求两个请求、两个 bridge-denied 更新和 end_turn。bridge 的正常 terminal 与操作被拒并不矛盾；最终 UBP permission_denied 由外层消费者承担，作者 acp-driver 最终日志第 5 行另覆盖拒绝后继续。此处没有把 bridge end_turn 写成产品成功。 |
| 原生 cancelled / failed | [protocol:441–450](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/zcode/protocol.rs:441)以 camelCase 读取 resultType；[mod:327–361](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/zcode/mod.rs:327)将确切 cancelled 映射 Cancelled，turn.failed 映射 TurnError::Failed；[agent:466–480](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/agent.rs:466)将 Failed/Rpc 走 ACP error，而非旧 warning + end_turn。普通完成仍为 end_turn；没有从文字猜 quota 或其他未见 enum。实际本机 native bundle SHA 仍为 e9f1868c…，与先前明确产生 cancelled/turn.failed 的证据相同。原终态真实性 P1 已关闭。 |
| 修复构建身份 | Cargo 版本为 0.1.0+ultra.zcode.0.16.5.r1；[host-profile:501–516](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/scripts/host-profile.cjs:501>)的既有两个 identity probes 要求精确 bridge marker 与 runtime 0.16.5。[driver:539](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/scripts/agent-execution-driver.cjs:539>)实际比较 trim 后 stdout，相异时走 acp_candidate_identity_mismatch。本人只读运行两个真实 binary --version，均 exit 0、无 stderr：旧安装输出无 r1，临时修复输出带 r1，SHA 与 Root 给定值相同。 |
| 旧 negative 没有翻正 | 旧 attempt 和 receipt 与 b765b55 逐字相同；[profile:185–227](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/scripts/host-profile.cjs:185>)仍绑定旧 marker 和原 receipt，writable_scope 仍 unsupported，其余未观察事实未改。当前声明 r1 对旧记录的 identity 比较失败，各必需维度 version_mismatch 是保守拒绝：[profile:285–299](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/scripts/host-profile.cjs:285>)。新增 [identity test:852–927](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/tests/acp-driver.test.cjs:852>)还要求修复身份的假设正向记录拒绝旧声明身份。旧 receipt 的逐字段/精确 SHA 断言仍在第 627–674 行；从 unsupported 改断言为 version_mismatch 反映拆分后的真实比较，不是改成通过。 |
| 维护合同的旧 session 承诺 | [SKILL:167–171](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/SKILL.md:167>)、[contract:119–125](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/references/delegation-contract.md:119>)、[matrix:126–133](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/docs/RUNTIME-COMPAT-MATRIX.md:126>)均移除旧 32 条/256 KiB/逐条 sessionId 等值检查承诺，明确 owner/turn 路由及无该比较的限制。没有将旧检查凭空归功于 SDK，也没有重建第二协议引擎。 |

真实身份选择证明的现有 [脚本:22–45](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/.ultra/.runtime/owner-factory-implementation-20260905/stage-b-build-identity-real-selection-proof.cjs:22>)调用生产 selectExecutionDriver、真实 profile、两个真实 bridge 路径和 App runtime version probe；未替换 probe 函数。其[原始日志:6–24](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/.ultra/.runtime/owner-factory-implementation-20260905/stage-b-build-identity-real-selection-proof.log:6>)显示旧 bridge 被 typed identity mismatch 排除 ACP、修复 bridge 选为 ACP。这是候选选择证明，不是 launcher 已接纳 Packet 或启动过业务 turn；版本探针确实启动短时进程，但没有 Provider prompt。本人没有重跑这份组合脚本。

## 验证证据及比例适当的保留项

作者完整日志已读取：bridge cargo test 8/8（0 ignored），bridge Python E2E 含正常 PONG、多拒绝、NATIVE-CANCELLED、NATIVE-FAILED 与 close；acp-driver 35/35（0 skip）、delegate 61/61（0 skip）、Skill validator 显示 “Skill is valid!”。本 reviewer 未重跑这些套件，Root 正独立验证产品。本人对 bridge 和 UBP 本分项路径运行的 git diff --check 均 exit 0。

日志 SHA：bridge-cargo-test 129d7ab75a810077b50db8571be18c8d099673a6dbaba085664097c180efbfd3；bridge-python-e2e f42a823718e9fea9998e1f58c18b573686b1c7fc0e6f129f7da523379f5cf6ee；real-selection-proof 70409fca031e26036a55dc530795119cb53122e2305579526484081075717207；acp-driver-tests 88e809961d18987be2eca23efbb1eac9f44a57d58303474f87d7ecc3bdd77b9a；delegate-tests 843d99f44ad8e0aa40c819c1c0a77d857118fb189ae7deb4210fd76ca0f84a61。它们都位于现有 .ultra/.runtime/owner-factory-implementation-20260905/，前缀 stage-b-build-identity-；历史终态修复日志仍保留旧 binary/patch SHA，不重写成 r1。

以下是 P2/证据限制，不阻塞此源码分项，也不授权自动扩大实现：

1. **已存在的 permission kind 与位置覆盖限制仍在。** [agent:694–698](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/agent.rs:694)仍按 option id 推 kind，native allow_project 会被归为 AllowOnce；当前同一 bundle 的真实排列先有 allow_once，UBP/ACPX 选择 first-kind，因此没有证明当前选中 allow_project 的可达授权扩大。未来顺序改变或其他 consumer 选项选择改变时才需重新评估。Started 首见 fallback（translator:82–94）仍不带 locations；当前权限请求独立携带 locations，不构成所审路径 fail-open。files 多字符串在源码保留，但当前新增测试只覆盖单 file_path；Python 多拒绝测试数目断言未额外断言两个 ID 的唯一集合，不能把它说成完整多路径/任意排列测试。
2. **拒绝效果不能推广为广告/工具选择等价。** [SKILL:152–153](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/SKILL.md:152>)与 [contract:97–101](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/references/delegation-contract.md:97>)的 equals a no-fs/no-terminal advertisement 只能按“这些客户端效果仍被拒绝”解释。contract 已明确真实广告存在，但 Host 看见广告后的工具选择与旧广告 false 是否相同未证明。最小处理是最终能力说明限定为拒绝行为，不因此新增 SDK 开关或重构协议。
3. **r1 的真实资格仍待 Root。** [matrix:186–188](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/docs/RUNTIME-COMPAT-MATRIX.md:186>)沿用 “passes … release build, and real provider session before use” 句子，不能据此把旧 real-provider/release 记录归到新的 r1 SHA。本次有真实 --version 和 fake App-server E2E，作者明确未运行 r1 Provider qualification，临时产物是 debug build。该文档后文第 240–247 行仍明确新身份未资格、当前 fail-closed；尚无现有错误接纳。最小处理是将旧验证标明历史，或在实际新资格完成后绑定新证据，不能靠本报告补成通过。
4. **一份中间 RED raw 已丢失。** [handover:86–92](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/work/owner-factory-implementation-20260905/stage-b-zcode-build-identity-repair-handover.zh-CN.md:86>)坦白 acp-driver 首轮两条旧身份断言失败日志被后续完整绿日志覆盖。现存文件确实只有最后 35/35。可以保存这项失落事实和当前精确断言变化，不能称所有失败 raw 都保留，也不应重跑旧版本来伪造“原始”记录。Root 独立当前验证仍可建立最终行为证据。

旧 negative receipt、真实新正向观察、writer 停止、Task Evidence 和 aggregate Review 各有独立消费责任；本分项没有提升 maturity、原生 Host 通用隔离保证或跨 Host 等价性。

## 审查字节绑定

| 首批读取对象（前后相同） | SHA-256 |
|---|---|
| bridge Cargo.toml | 5974b62638ae15f91d4ae69da4ad5a6aa27ae0475b09717f5c16c0c577a99daa |
| bridge src/acp_translator.rs | fd00e801992d6badf339d2289a770d4aaaa4428734ba975c20b48edb48a25fe1 |
| bridge src/agent.rs | fc84de35307e159e2a069063f10f3f3cb0db2a9167841a06f2d969b02d50dcc3 |
| bridge src/zcode/mod.rs | 626dfd7d65825e3dbaac584fd7500bcbd71d9276f765c1e219e78cd992d5e9c0 |
| bridge src/zcode/protocol.rs | 5d665d32f37a0933ad818e4f79e790d010d663e6534682a5eaa908bb2f033222 |
| bridge target/debug/zcode-acp | ebc2932b0d1c6c78efe133aea68d1e6616615eed8e2c5c229a41f3ba81ca9eba |
| UBP canonical patch | 8c127dba648720121da9326cae721141785f03ef72bdfae2201f50e59bb9cb36 |
| UBP host-profile.cjs | 0f330a88bb2441d445af326928ba08c2eeb2434a40c486994e85dcbd871a3681 |
| UBP ultra-delegate/SKILL.md | 64d37f01ba003c59dbd29df3adf87709fe9cdeef7f7f76d178088ad59c0b1147 |
| UBP delegation-contract.md | 301fe199dbd939d8a8e06ceb4646b8a32444efb481b1eea08836b613f114c7c7 |
| UBP RUNTIME-COMPAT-MATRIX.md | d01ba174e35005ae94f680894e4a27b1692f3841fd86274e540615976c214a61 |

补充最终读取 SHA：bridge Cargo.lock 0bc0b0e1a1f0603bb3b0e5a020a3ae529ce3eb11a89cd523eee3203eaf850522；acp_client.py 69b30b19e6a6792eb1888bb993ef86633ab9131eb7d4f8d4a256de0250687e5d；fake-app-server.cjs 47ade3cfb5182c13f9dc6cc87b3ef7f0079c53835c4b5c8d9b5c7ba48a780407；UBP acp-driver.test.cjs 9e703cd3686cc076982218bb26cfc8503b54340c670d4770e83c10ca90dc63c9；delegate.test.cjs 0ea5f84a5ebd5d009bfb485f5c3ccb090e899820a28e257ffe8e1fd01be8bf49。测试文件受完整 patch 或本次对应消费者 diff/日志覆盖，未伪称最初首批逐文件 SHA 已包含它们。

旧安装 binary SHA 0e9c8fb2827c566c8a623f3a9706715a221ce7a9b1d3eef32c839937c62420dd；本机 native bundle SHA e9f1868c0fdb863537ed910ee3828b9be96b8c2fd805473f63b439e1113266b8；旧 attempt SHA 87b71b641d204907b8368b834db2093fb3cbb384e6023f8181c236d7972e0897；旧 negative receipt SHA 936c77949630c52a7ca128c0f780cc98b2f3a046e5ff8d500bb41cd145bdde01。未替换任何这些字节。
