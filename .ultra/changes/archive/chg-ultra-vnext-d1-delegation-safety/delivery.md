# Delivery: chg-ultra-vnext-d1-delegation-safety

## Outcome Reconciliation

D1在本地完成：共享delegation边界按目标Host过滤probe、worker与最终Host环境，保持packet路径只在launcher/worker中；外层或内层writer不能证明已停止时保留unknown、lock和fence。协议版本必须实际观察，未证明/不支持的协商不能提交prompt。证据见`.ultra/evidence/vnext-d1-runtime-safety-boundary/evidence.json`。

Pi 0.85.1原生CLI接入既有权限判定及typed结果，保留八个原生工具。实际生产入口完成合法write/read、禁止操作的原生attempt-and-denial及独立无效果观察；完整资格入口随后实际finished且writer stopped。精确版本及七个共享/原生模块摘要绑定见`.ultra/evidence/vnext-d1-host-enforcement-qualification/stage-b-pi-native-receipt.json`。Bash curl仍是execute，不伪称独立fetch工具。旧ZCode失败、Claude未证明、解析错误和OpenCode401保留。

本交付只关闭D1 / Stage B。Stage C/D/E与八步计划第五步的其余部分仍继续，未宣称完整工厂或跨会话运行已完成。

## Specification and Documentation Updates

`skills/ultra-delegate/SKILL.md`、`references/delegation-contract.md`、`docs/RUNTIME-COMPAT-MATRIX.md`、`.ultra/specs/product.md`和`architecture.md`描述实际环境、writer-truth、exact-identity与Pi工具效果边界。`adapters/_shared/plugin-core.cjs`通过既有安装库存提供两个原生Pi模块。安装仍由六Host适配器承担，未新增Pi安装器。

对应agent-delegation当前0.5.0源码的共享ACPX入口已提交705734c，六路径经72项检查并ff-only合入原main；未安装到HOME。Goal对应修复已在独立上游，当前126项相关检查通过，未重复实现。

## Verification

| Command | Exit | Evidence | Freshness |
|---|---:|---|---|
| npm run verify:release，使用现有UBP_TEST_ACPX_ENTRY | 0 | work/trellis-eight-step-20260909/step5-pi-final-release.log | 当前源804 Node、104 Hook、audit0；之后无产品代码变更 |
| npm pack --dry-run --json | 0 | work/trellis-eight-step-20260909/step5-pi-final-pack.json | 当前安装库存 |
| node bin/install.js --all --global --doctor --json | 2 | work/trellis-eight-step-20260909/step5-pi-final-doctor.json | 真实HOME既有degraded，无安装主张 |
| node --test tests/project-artifacts.test.cjs | 0 | work/trellis-eight-step-20260909/step5-stage-b-artifact-check.log | 当前Acceptance及raw证据摘要检查 |
| Skill Creator quick_validate.py skills/ultra-delegate | 0 | stage-b-final-skill.log | 当前Skill |
| strict Review-to-Test consumer + fresh worktree digest | 0 | test-report.json | 精确summary/admission/subject及HEAD/product/intent匹配 |

原始日志和patch上下文中的空白保持原字节，完整cached diff check报告该历史格式；当前source/tests/docs/workflow范围检查通过。最终Test消费的是已暂存全部证据后的实际product摘要。

当前Test完整六区域结果、接线清单、命令、原始证据重验及身份在本目录`test-report.json`。每个Task保留各自的completion snapshot；不把aggregate快照冒充task Review的worktree绑定。

## Review

`.ultra/reviews/vnext-d1-aggregate-stage-b-delta-20260909/SUMMARY.json` APPROVE，SHA `52e5e04d366e1ae62e6123a4cd53a5c68b5bdddac7c6cd7fa54e78f4a7f9c296`。Packet SHA `668b52984a63bf2db186ddf7a029e277ba6ecd6363c5498ef6fe8283a0af3bec`。三个独立Pi native上下文逐项确认父级review-spec-001、review-tests-001、review-errors-001已解决，本次delta没有新增finding。

## Technical Debt

保留父级aggregate所有P2/P3及Task2的一个P2，不自动修复：原生完成解析缺少反向start关联检查；真实资格记录具有匹配start/end。另有精确Host资格的可移植性、其他平台进程身份和stale fence恢复等历史限制，原对象见父级SUMMARY而非改写成已解决。Owner决定未来优先级，当前仅做P0/P1要求范围内修复。

## Residual Risks and Omissions

Pi资格绑定当前macOS、Node、Pi包及policy字节；改变这些对象必须重新资格验证，不能将本机结果推广给全部Host。它是协作workspace观察，不是恶意OS进程隔离。Windows真实执行、其他Host正向资格、C/D并行收益与W3/W4均未验证。真实HOME安装不变；provider授权与Worker效果许可分离。

## Recovery

使用本次Stage B提交的普通Git revert或新修复提交恢复，不改写历史。未证明停止的writer仍需按原status/cancel事实核对，禁止删除fence后直接重跑。原始Pi事件有独立gzip归档和SHA索引；全部失败历史与旧task Review保留。此前冗长状态记录保存在step5-pre-closure-state-history.zh-CN.md。

## External Effects

Owner八步实施指令授权本地分段commit、文档和验证，后续明确由Codex独占实现。版本保留5.0.2开发元数据，无发布版本主张。agent-delegation本地提交705734c及ff-only合入已完成；UBP本地Stage B提交紧随本记录。push、tag、npm publication、GitHub Release、部署、真实HOME安装、凭据修改均未执行。
