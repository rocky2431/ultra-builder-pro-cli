# 对抗性审查盲测记录 — 2026-08-14

## 结论

本轮证据不支持增加永久第七个 `premise` lens。当前 `review-spec` 在明确要求校验
North Star 因果贡献后，已经覆盖候选 lens 的五类已知缺陷；候选 lens 没有稳定找到
当前 roster 漏掉的 consequential defect class。

因此保留六 lens roster，把 premise challenge 固化到 `review-spec`，并把独立
`premise` 角色保留为 Plan 与 aggregate Test 的 blind cross-family probe。这个 probe
是隔离采样，不参与投票，也不能用无效结果替代六 lens findings。

## 评估边界

- Fixture revision: `37c07dc8596cda64a93aac260917b3c091ad1b58`
- Hidden seeds: `tests/evals/adversarial-review-seeds.json`
- Current prompt: `tests/evals/prompts/current-spec-lens.md`
- Candidate prompt: `tests/evals/prompts/candidate-premise-lens.md`
- Six-lens probe: `tests/evals/prompts/current-six-lens-probe.md`
- Permission: read-only、无 external effects、独立 Git worktree
- Claude Code: `2.1.232`
- Kimi Code: `0.31.1`，显式模型 `kimi-code/k3`
- Grok Build: `1.0.3 (1a29d5bc12d4)`
- ZCode CLI: `0.16.3`，临时非持久化 provider 配置，GLM-5.3

Seed manifest 从所有 Worker Packet 中隐藏。所有有效结果都通过
`ultra-delegation-result-v1`、packet digest、只读 diff 和 launcher strict validation；
模型陈述“未修改文件”本身不算权限证据。

## Seed 映射

| Run | Premise | Correctness | Test coverage | Recovery | Documentation | 可计分 |
|---|---:|---:|---:|---:|---:|---:|
| `spec-claude` / current spec | yes | yes | yes | yes | yes | yes |
| `premise-claude` / candidate | yes | yes | yes | yes | yes | yes |
| `six-kimi` / current six concerns | yes | yes | yes | yes | yes | yes |
| `spec-zcode-3` / current spec | yes | yes | yes | yes | yes | yes |
| `spec-grok-4` / current spec | partial raw text | partial raw text | partial | no stable result | partial | no |
| `premise-grok-4` / candidate | partial raw text | partial raw text | partial | partial | partial | no |

Claude 的 candidate 产生了比 current spec 更多的表述和风险拆分，但没有新增 seed class。
Kimi 的完整六关注面与 ZCode 的 current spec 都再次找到五类 seed，说明 premise/causal
挑战可以被最窄地放进 specification fidelity，而不必增加一个永久 lens。

Grok 四轮尝试均以 exit code 0 结束，但输出被 host wrapper 截断或混入重复、畸形 JSON，
launcher 正确发布 `failure_type: missing_result`。原始片段里出现若干真实缺陷不能算成功
findings；这证明的是 Grok 1.0.3 的 structured-result conformance 缺口，不是 lens 语义结论。

## 原始观察

原始 receipt、worker spec、stdout、stderr 与 terminal result 保存在可重建观察区：

`.ultra/.runtime/adversarial-eval/2026-08-14/delegations/`

关键 terminal result SHA-256：

- `spec-claude/result.json`: `14156c2fd86936a725fe5e9e42b90e8cb9e80e2d3045304046bd9791baa5caaf`
- `premise-claude/result.json`: `bf39a38b5893f53a18f95f55932b28e381edbf2f4a8bae9b1dd1180b61267bbd`
- `six-kimi/result.json`: `ca523134aa30f2ad39ebf539dd2b31b74b06c966c37d4cee4feae17574bf6aaf`
- `spec-zcode-3/result.json`: `f9409cdd62a5e41a5b183cbed155e25e097ec9a27d0d0bfae0f9e74d87468956`
- `spec-grok-4/result.json`: `0d33a9f5f4a80d75b0ebb908d30f6d12d9e26be1f3122b976dfd126fba8a34de`
- `premise-grok-4/result.json`: `6e33fd9fc6a17313151a640717ad257efbfb780417044f8b9d92cc46acd128b5`

该目录是 disposable evidence，不是项目语义权威；可由 tracked fixture、prompts 和当前
delegate launcher 重建。

## 产品决定

1. 六 lens roster 不变。
2. `review-spec` 必须同时验证 accepted behavior、North Star Trace、因果链、contradiction
   disposition，以及“全部 acceptance 通过但 outcome 仍失败”的路径。
3. Plan review 与 aggregate Test review 必须产出六 lens session；没有 findings artifact
   不得声称阶段完成。
4. 可用不同 model family 时追加一次 blind premise probe；不可用时记录缺失，不伪造独立性。
5. `execution_mode` 和每个 worker 的 coverage refs 必须落盘。顺序角色扮演只能记录为
   `sequential_fallback`，不能声称 isolated multi-agent。
6. 只有 fresh blind fixture 反复证明 current roster 漏掉独立 consequential class 时，
   才重新讨论第七 lens。

## 最便宜复测

先运行 `node --test tests/adversarial-review-eval.test.cjs`，确认 green-test trap 与五个
hidden seed 仍存在；然后在新的隔离上下文中用相同 permission 分别运行 current spec 与
candidate premise prompts。不得向 worker 暴露 seed manifest 或本报告。
