# Stage B strict Review / Task Evidence v2 收尾准备

2026-09-06；本次输入观察时间为 2026-09-05T19:40:29.388425+00:00。**这只是只读准备，不是 Review、ADMISSION、SUMMARY、Task Evidence 或 Stage B 接受。** 实际 ZCode 最终修正尚在进行。两个任务仍为 in_progress，本次没有运行 Provider、写实现/测试、创建 review session、改 ledger/context/evidence 或执行 commit；只写本文件。

当前完整 Owner 实施授权已覆盖旧预算耗尽与 no-commit 限制；沿用原验收要求，不恢复已经消耗的旧 attempt，也不改写旧失败。此点有[当前实施记录第 3–15 行](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/.ultra/decisions/2026-09-06-stage-b-implementation-scope.md:3>)支持。已有 stage-b-readonly-preflight.zh-CN.md 是旧实现前置调查，未包含本次严格收尾操作，可复用其历史定位但不能替代本文件。

## 1. 当前可用的顺序与 direct parent

顺序为：最终 writer 结束及 Root 验证 → runtime Task Review → runtime v2 / raw readback / context readback / ledger completed readback → qualification Task Review → qualification v2 / 同样 readback → D1 aggregate Review。依据：[Review:23–40](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-review/SKILL.md:23>)、[Dev:220–260](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-dev/SKILL.md:220>)。第一份任务 Review 不要求先有最终 v2；aggregate 消费已经完成的两个任务的当前 v2。

这三个 parent 在本次均经当前 review_wait.py 的严格 summary 模式、精确 packet SHA 和 stdin summary snapshot SHA 重放，exit 0，无 stderr；没有使用 legacy 兼容模式或重新运行 packet admission：

| 新收尾对象 | 唯一 direct parent session | parent SUMMARY SHA-256 | review_history.unresolved_blocking_ids |
|---|---|---|---|
| mode=task，task_ids=[vnext-d1-runtime-safety-boundary] | vnext-d1-runtime-safety-delta-2-evidence-reopen-review-20260902 | 752708c7a8d6b53871ef0b749e10d04ba980cfea69996387f7f3c3366bb8b89b | [] |
| mode=task，task_ids=[vnext-d1-host-enforcement-qualification] | vnext-d1-host-enforcement-delta-1-review-20260902 | 62b04ccd3840d8acd4f7b25f44d3e97fe05d48f5d382ef1f96d47f9c482e21bb | [] |
| mode=change，task_ids 顺序为 runtime、qualification | vnext-d1-aggregate-review-20260902 | 1ce9dfed3700a1d743cdfdac6ac3dad562cf5d44fe7902cbd3f68767a064b558 | [review-spec-001, review-tests-001, review-errors-001] |

表中 parent_summary_ref 均为 .ultra/reviews/对应-session/SUMMARY.json；review_history **只有** parent_summary_ref、parent_summary_digest、unresolved_blocking_ids 三个字段。两个任务 parent 的历史 APPROVE 不接受本次新字节：当前任务已经显式 reopen，本次审新修复 subject。历史 runtime evidence-reopen delta 本身已有“接 APPROVE parent、未解决 ids=[]”的同类记录：[旧 packet:134](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/.ultra/reviews/vnext-d1-runtime-safety-delta-2-evidence-reopen-review-20260902/WORKER-PACKET.json:134>)。

**不能把旧 aggregate 当作 task parent。** 实际 helper 在内存中检查该组合，返回 “WORKER-PACKET.json review_history parent SUMMARY mode does not match the current packet”；同 mode、change_id、ordered task_ids 是硬比较：[review_wait.py:1535](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-review/scripts/review_wait.py:1535>)。本次也只读验证了表中三个正确组合，均无 history diagnostic；此 helper 结果不是新 packet admission。

任务当前修复的因果范围仍须覆盖 aggregate 指出的 runtime 环境真实 spawn 观察、EPERM/unknown writer 恢复，以及 qualification 的正向 D1Q-02；以当前源、原始失败/修复记录和现有任务 Acceptance 作为输入。不能把 aggregate 的 finding IDs 塞进空 findings 的任务 parent，不能把两个 parent 路径、旧十条 findings 或全史摘要藏进 packet 扩展字段。整个 packet 中外国 review 路径只允许出现在唯一 parent_summary_ref：[review_wait.py:1425–1506](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-review/scripts/review_wait.py:1425>)。aggregate packet 可用两个 canonical evidence.json 路径消费任务结论；不需把两份 Task SUMMARY 路径再直接嵌入该 packet。各 evidence 的 task_review 自有独立 provenance，不是 aggregate 的第二、第三个 parent。

## 2. 新 Review 的最小现有操作

以下命令均从仓库根执行；session 和 digest 变量在 **最终输入就绪后** 由 Root 填真实值。没有自动生产语义 verdict 的 CLI，也不应为了形状完整预造 lens finding 或 SUMMARY。

1. 先按 [Active Change 规则:19–34](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-change/references/change-contract.md:19>)稳定核对唯一 active Change、ledger 与对应 context。当前唯一 Change 为 chg-ultra-vnext-d1-delegation-safety；当前 HEAD 为 b765b55cca0e1eaacebc738a68de77906bb50756，最终须重读，不能复制旧 adb7bfe HEAD。
2. 实际 writer 停止、受审源和 pre-review 原始证据准备完毕后，才在全新 .ultra/reviews/session 下创建一次 WORKER-PACKET.json。字段沿用 [worker-packet:37–112](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-review/references/worker-packet.md:37>)：schema=ultra-review-worker-packet-v1，admission_contract=ultra-review-admission-required-v2；当前 head、明确 range、mode、change_id、ordered task_ids、真实 acceptance/public_seams/diff_files、context_files、north_star_trace、subject_observations、workers/output_directory，以及上表单 parent。range 记录实际受审基线和未提交差异，不声称它是已提交 revision；diff_files 包含本次被审新增/修改的实际路径，不能仅靠忽略 untracked 的 git diff 名单。
3. context_files 绑定完整当前 context SHA；acceptance 每项为 repository-path#heading: owner-readable claim。subject_observations 顺序严格为 Change、按 UTF-8 路径排序去重的 acceptance sources、canonical North Star validator 的 decision、snapshot；每项恰好 role/path/sha256/byte_length。同一路径同时承担 change 与 acceptance_source 时保留两种 role，不能自行跨 role 去重。
4. 先捕获 North Star 稳定原始字节，再通过现有 stdin seam 得到报告并比对其 input 路径/长度/SHA。可执行的 CLI 形状如下；packet admission 会独立重做这项稳定输入检查：[review_wait.py:633–667](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-review/scripts/review_wait.py:633>)。

       rtk proxy node skills/ultra-research/scripts/validate_north_star.cjs --stdin --path '/Users/rocky243/Context Engineering/ultra-builder-pro-cli/.ultra/north-star.md' < .ultra/north-star.md
       rtk git hash-object .ultra/north-star.md
       rtk proxy shasum -a 256 "$D1_REVIEW_SESSION/WORKER-PACKET.json"
       rtk proxy python3 -B skills/ultra-review/scripts/review_wait.py "$D1_REVIEW_SESSION" packet --packet-digest "$D1_PACKET_SHA"

   保留 packet command 的原始 stdout/stderr、exit code；只有 status=complete 且派生 ADMISSION.json 已真实发布，才能启动选定 lens。ADMISSION 是脚本 create-once 产物，不手写、不覆盖。packet/context/authority 已变或 admission_conflict 时，用新 session，而非修冻结 packet。[Review:38–43](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-review/SKILL.md:38>)。
5. 按修复风险选 review-spec 与实际相关 engineering lenses；每个选定 lens 独立保留覆盖/限制和实际 finding。完整六人 roster 在最终 selection 中逐项 selected/skipped，不能用纯 spec/空 engineering 伪造 APPROVE。所选真实 stems 替换下面的 review-spec review-code review-tests review-errors；这只是当前 runtime 风险相符的命令例，不是新增固定数量门槛。

       rtk proxy python3 -B skills/ultra-review/scripts/review_wait.py "$D1_REVIEW_SESSION" agents --packet-digest "$D1_PACKET_SHA" review-spec review-code review-tests review-errors
       rtk proxy python3 -B skills/ultra-review/scripts/review_wait.py "$D1_REVIEW_SESSION" summary --packet-digest "$D1_PACKET_SHA"

   第二条在真实 SUMMARY 写完后执行。每份 lens 与 SUMMARY 复制 packet_digest、ADMISSION 原始字节 SHA 即 admission_digest、receipt.subject_digest。SUMMARY.context_digest 用 packet 派生值；SUMMARY.worktree_digest 必须为 null，[脚本:2395–2412](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-review/scripts/review_wait.py:2395>)会拒绝自行填入产品 digest。findings 是 packet 顺序的完整原样 union；执行上下文复用即 sequential-shared-context，不能写 isolated。依据：[schema:171–227](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-review/references/unified-schema.md:171>)。
6. 保留 waiter 返回的 summary_digest 和真实 verdict；exit 0 只证明 transport complete，也可能是 REQUEST_CHANGES。Root 的语义 Review 通过后才走 v2；若出现新 P0/P1，沿当前授权让实际实现者修、再用当前新失败 SUMMARY 作同 scope 直接 parent，而不是继续引用本表的更早 parent。P2/P3 原样报告。

## 3. dirty worktree 的 completion subject 与 v2/readback

先完成 Review 范围内最后一处修复和证据刷新，验证最终 SUMMARY。之后立即用现有工具捕获本任务 completion subject，输出保留在该任务 .ultra/evidence/ 下的具名新观察文件，或现有 ignored runtime 目录；不要把这个 digest 写入会被自身覆盖的 work/报告或 task context 再反复重算。

    rtk proxy node skills/ultra-test/scripts/worktree_digest.cjs --project '/Users/rocky243/Context Engineering/ultra-builder-pro-cli' --change-id chg-ultra-vnext-d1-delegation-safety

映射为 subject.git_head=输出 head、subject.worktree_digest=输出 diff_digest；subject.observed_at 是实际捕获时间，CLI 本身不返回时间。原始输出还保留 dirty、intent_digest、untracked_files。该脚本绑定 HEAD、tracked binary diff、未忽略 untracked 路径/字节；固定排除 test-report、evidence、reviews、runtime、progress 和 Change 目录，intent 另行捕获，不允许调用方另加排除。依据：[worktree_digest:15–25](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-test/scripts/worktree_digest.cjs:15>)、[511–560](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-test/scripts/worktree_digest.cjs:511>)。四个关联 checkout 的源 SHA 与临时 bridge/entry 执行字节须由真实资格记录另绑，UBP worktree digest 不会自动覆盖仓库外文件。

**无需制造循环摘要：** 新 SUMMARY 和 raw/evidence 位于固定排除边界内；context、ledger、work/文档则在产品边界内。按 Dev 规定先捕获 subject/发布 v2，再更新 context 和 ledger，会产生后续产品观察，这是如实的“完成快照之后的收尾”。旧 task subject 不重绑成 ledger completed 后的 digest，也不重绑成后续 aggregate digest。aggregate 重新捕获当前整包即可；后续变化若真的使引用证据或 Acceptance 失效才 reopen，不因正常 closeout 元数据变化重复 Review。[v2:47–56](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-plan/references/task-evidence-v2.md:47>)、[279–286](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-plan/references/task-evidence-v2.md:279>)。

发布一个 canonical .ultra/evidence/task-id/evidence.json；根字段顺序必须是 $schema、task_id、change_id、context、subject、acceptance、dimensions、task_review、artifacts、limitations、timestamp。每条 criterion 保持原 verification_type；command 记录 command/cwd/exit_code/raw_evidence_ref/raw_evidence_sha256/freshness_identity，external-observation 记录 provider/run_id/observed_at/raw_evidence_ref/raw_evidence_sha256/observation。各命令的 freshness_identity 是该命令真实观察，不把旧命令重新归功于最新 subject。dimensions 的六项与 disposition/rationale 保持明确且有证据。task_review 绑定**本次最终 Task** session/summary_digest/execution_packet；不把 aggregate 当任务摘要，不重新灌入整个历史 blocker 清单。[v2:31–146](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-plan/references/task-evidence-v2.md:31>)。

Acceptance SHA 要沿用实际 consumer 的精确切片：[tests/project-artifacts.test.cjs:42–48](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/tests/project-artifacts.test.cjs:42>)从“## Acceptance Criteria\n”起，到下一“\n## ”匹配的首个换行之前。**不要额外包含那个分隔换行，也不要 trim。** 本次按该规则重算与已保留 stage-b-context-acceptance-check.json 一致；通用整段正则若多保留一个尾换行，会算出另一值，不代表 criterion 改变。

发布前和发布后都按 [Dev:245–253](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-dev/SKILL.md:245>)独立 stable-read 每条 raw ref：仓库内、普通非 symlink 文件、每父目录不逃逸、no-follow/nonblocking、最多 8 MiB、读取前后路径/descriptor identity 一致，比较同一批字节 SHA。shasum 本身不是这项稳定路径检查的替代。然后：

    rtk proxy node skills/ultra-plan/scripts/validate_task_evidence.cjs .ultra/evidence/vnext-d1-runtime-safety-boundary/evidence.json --projection
    rtk proxy node skills/ultra-plan/scripts/validate_task_evidence.cjs .ultra/evidence/vnext-d1-host-enforcement-qualification/evidence.json --projection

逐任务在它发布之后执行并保存 stdout/stderr/exit code。strict-v4 分支的这个 sensor 校验形状和输出 projection，**不会替 Root 重放 strict SUMMARY、解引用所有 raw ref 或判断 satisfied**：[sensor:838–855](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-plan/scripts/validate_task_evidence.cjs:838>)。另外重放对应真实 SUMMARY，可通过已有 snapshot CLI 绑定自己捕获的精确字节：

    rtk proxy python3 -B skills/ultra-review/scripts/review_wait.py "$D1_REVIEW_SESSION" summary --packet-digest "$D1_PACKET_SHA" --summary-snapshot-digest "$D1_SUMMARY_SHA" < "$D1_REVIEW_SESSION/SUMMARY.json"

完成 canonical record/raw readback 后更新 context 的 Task Review、Completion、Resume Note；再读回这些事实，最后写该 ledger 行 completed 并读回。[v2:247–250](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-plan/references/task-evidence-v2.md:247>)。本准备任务未执行任何上述发布动作。

## 4. 最少保留的证据，以及 aggregate 的终点

| 位置/结果 | 收尾时用途与边界 |
|---|---|
| 现有 stage-b-p1-mutation-fail.log / stage-b-p1-correct-pass.log | 原始真实 spawn seam 的 RED/GREEN；保留原字节、被测源/测试 SHA 与实际命令，不把早期变体归成最终来源。当前日志分别保留 banned-key assertion failure 与 1 pass。 |
| 当前最终 delegate / ACP driver / CLI / conformance focused 输出，release、Skill validator、pack、diff check | 保存真实 command、cwd、版本/环境说明、开始结束与 exit code、原始 stdout/stderr；带最终测试前后源/产品观察。现有 stage-b-delegate-focused.log、stage-b-driver-suites.log、stage-b-verify-release.log、stage-b-pack-dry-run.json 是可查证材料；若写作之后 changed bytes 已使它们不是最终 subject，不能把旧 0 改作新通过。 |
| stage-b-root-final-entry-tests.json/.log 和 entry 最终独立源码审查 | 已有 54/54、0 skip、实际 entry/README/installer/tests 前后 SHA。支持公开 ACPX entry 的具体消费者，不代替真实 ZCode 资格或 UBP 全部集成。 |
| 本次独立具名 qualification 的新 attempt、pre-dispatch、raw events、最终 observation/receipt | 保存确切 instruction/permission bytes 与 SHA、实际 run/attempt id、Host/model/adapter/runtime/patch/entry 路径版本摘要、argv、时间/deadline；保留允许的 in-root 结果、每个独立拒绝尝试和地点/工具证据、coordinator pre/post 文件与 loopback 观察、env keys/canary 无泄漏检查、writer 停止/unknown 与终态。只依据实际尝试成立的维度判定；summary 或模型自述不能证明 denial。D1Q-02 仍要求正向，不能标 not_applicable。[task criterion:161–165](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/.ultra/contexts/task-vnext-d1-host-enforcement-qualification.md:161>)。 |
| 新 Task/aggregate WORKER-PACKET、ADMISSION、选中 lens、SUMMARY 与 waiter 输出 | 完整保留至 Test/Deliver 消费；记录每个 exact-byte SHA。review_summary 的 subject_digest 是 ingress authority observations 的摘要，独立于 completion worktree digest。 |

有新的代码或公开字节变化时，Root 依已接受测试要求完成必要检查；本文件不要求重复已对相同最终字节成功完成的套件。日志不能只留最后一行，也不能拿 summary/count 代替实际输出。原始负向材料与新 positive attempt 必须用不同名字；当前两个 canonical evidence.json 均不存在，尚存的 evidence-reopen-20260902.json 是旧 gap 观察，不预填为通过。

runtime 和 qualification 分别 completed/readback 后，aggregate 使用 mode=change、两个 task_ids 的原顺序、两份新 canonical v2 的 exact --projection 输出，并按第 1 节只接旧 aggregate direct parent。保持当前三个 P1 的具体因果检查与 P2/P3 残留；final verdict 由实际 lens 证据产生。先读 v2 的 raw/current Acceptance/task-review，后创建 aggregate packet；不把 aggregate SUMMARY 写入尚待它产生的 task_review。

若随后继续现有 Test/Deliver 消费，独立捕获当前 aggregate worktree，保留 task_evidence projection，写当前 .ultra/test-report.json 后运行下面的既有 transport consumer；**Task v2 阶段没有要求伪造 Test report 来调用它**：

    rtk proxy node skills/ultra-test/scripts/validate_review_transport.cjs --summary "$D1_AGGREGATE_SUMMARY" --report .ultra/test-report.json

依据：[Test:103–134](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-test/SKILL.md:103>)。它绑定当前 Change/task_ids/HEAD、原 SUMMARY bytes 与 provenance；不能把 nullable review worktree 字段改成存在精确代码绑定。此准备没有创建最终 Test/Deliver，也不以当前任何绿色静态记录宣告 Stage B 完成。

## 5. 本次只读绑定，最终发布前重新捕获

| 输入 | 本次 SHA-256 / 精确信息 |
|---|---|
| .ultra/tasks.json | a063b44bb1c82e846bfac9c0b84341695968817a80ac12c323a5f1c50016b00c；两个 D1 行均 in_progress |
| runtime 完整 context / Acceptance | da7786d417393a6950236226395b4d9fefa8555dfa396c0f2839e2f8150a2cec / 5d8cda45a87088bd082e74dc84230333fad8567d5b022212000cf16157a9cb5e；Acceptance 2103 bytes |
| qualification 完整 context / Acceptance | 445146a91f820725b20009429286792f45d07537a1876eef44d7e9984ec62902 / e5a8b33d17c7b2bed30fa351f59f83b5d0169418d16eecc977e6f18987ff2914；Acceptance 1935 bytes |
| D1 intent | facd82839282352c100e432c4d13720de98bcc1a6d17f8a9e57c01d659a6e437；12052 bytes |
| canonical North Star 与 accepted snapshot | cfd1a9c2d19421fbe01b02bb33d94cf04485f87539edc79abb32c3c3583fc578；26480 bytes；revision north-star-v2-r3；git blob 439b7838e2a672fd2d2cb6e0f11e94a61d0f76c8 |
| North Star decision | .ultra/decisions/2026-08-17-ultra-3-0-north-star-r3.md；87d4a4311be3073694e86484f7f31dd8cbbe64447358b70b14ce16db99953ceb；4747 bytes |
| accepted snapshot 路径 | .ultra/research/2026-08-17-ultra-3-0-r3-projection/north-star-v2-r3.accepted.md |
| 本次 canonical validator stdout | 597d01186e52db9ec4851585e68077e4b50ef4781bb3303ddce20ced1b9f7426；当前读取报告 accepted，input path/bytes/SHA 和 source_observations 一致；不是新 ADMISSION |
| 原 runtime evidence-reopen | a5009b75c0f5e100348494d4b2df278557b508eb164a6808b6cc7a33705bb2c4 |
| 原 qualification evidence-reopen | 640412cf281819b89e0a370efc82f30a98314860356d13ccf18d23a5e5bb0ac7 |
| 原负向 host-enforcement-attempt / receipt | 87b71b641d204907b8368b834db2093fb3cbb384e6023f8181c236d7972e0897 / 936c77949630c52a7ca128c0f780cc98b2f3a046e5ff8d500bb41cd145bdde01；原 attempt d1q-61ca5157911e4f61866cff5452bc942d 不变 |
| review_wait.py | 4e51614fe5a411efd6fbce2437ebd14a403a8b2fa7a6ae5ef97d3b96de4eb8a4 |
| validate_task_evidence.cjs | 327d1dfd780e190c9810d025483687598bdad72c6473f702afa80c7e93d247c6 |
| worktree_digest.cjs | 31fb16653f4f0e1f35c4af329a7b19009674b4d1e32d6a366cbac06043bb2915 |
| validate_review_transport.cjs | be957b671bea153c9031de8deafd111f202b334e529200d65977f2c4abd29ee2 |

三个历史 parent 对应的 packet SHA 分别为 runtime 95ea15a75a0a61792f38f11e6222c0f08a0deab86eef17243b20622f71ef26e5、qualification 152a8f45453d42744e7faca1fd7f2048c24ec2f892fdc036e89968e374755930、aggregate b359abcb484ebc7ace5b32345d0088d37ec03c2ae517999c6f68b467b2cea51b；本次严格重放均返回表中原 SUMMARY digest。两份 task 原 verdict 为 APPROVE；aggregate 仍为 REQUEST_CHANGES，P1=3/P2=8/P3=1。旧 verdict 是历史事实，不是本次结果。
