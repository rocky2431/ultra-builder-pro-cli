# Ultra Builder Pro 5.0 live ACP conformance — 2026-08-26

## 结论

本报告把每个 Host 的 ACP 激活结论绑定到自己的真实 provider receipt；一个 Host 的
结果不能提升另一个 Host。Claude Code、Codex、OpenCode、Kimi Code、Grok Build 与
ZCode 当前全部为 `PASS`，六个 profile 都可以在对应 executable 存在时选择 ACP。

`PASS` 的共同条件是：stable ACP v1、真实 provider、精确
`ultra-delegation-result-v1`、只读 isolated worktree、Git unchanged，以及 worker
进入 terminal state。`end_turn` 本身不是完成证据；它必须和 exact result/diff
validator 一起成立。

## 方法

命令：

```bash
node skills/ultra-delegate/scripts/acp-conformance.cjs \
  --host <host> \
  --output .ultra/evidence/v50-live-acp-activation/host-<host>.json \
  --timeout 240
```

Harness 经过真实 `delegate.cjs`、background worker、`AcpDriver`、exact result
validator 和 Git-diff validator。Receipt 只保存候选命令、协议/result 状态、事件数量、
子进程终态及临时 artifact digest；不保存 prompt、provider text、hidden reasoning、
credential value 或 raw JSON-RPC。临时工作树和 raw artifacts 在计算 digest 后删除。

## Host register

| Host | Candidate | Result | Receipt SHA-256 | Observation |
|---|---|---|---|---|
| Claude Code | `npx --yes @agentclientprotocol/claude-agent-acp@0.70.0` | PASS | `9b1d88cbd5e5b66a56e0cf19f34e7f2107f9e4b8fde9d80b9eadcdfc8f4a25e3` | ACP v1, `end_turn`, exact result, clean Git, worker exited |
| Codex | `npx --yes @agentclientprotocol/codex-acp@1.6.2` | PASS | `e82287609397807fb6968dff104d7f6569499b53c77be6a186aa33939a4c629e` | ACP v1, `end_turn`, exact result, clean Git; adapter was terminated after the logical turn |
| OpenCode | `opencode acp` | PASS | `3575b148f6feb8c9f1472add705390e6d47b87be080403ec7006b66a29f7873b` | ACP v1, `end_turn`, exact result, clean Git, worker exited |
| Grok Build | `grok agent stdio` | PASS | `370eeae12d63443188d519825ed8040fd8bba9b27fddb82e499d9cb590f4a33d` | ACP v1, exact result, clean Git; creation-time metadata was bounded and identity-checked before use |
| Kimi Code | `kimi acp` | PASS | `30d8adec2877f80fadf0b20c3cb7fa6b732dea3598d7484c143f9835770301fe` | ACP v1, `end_turn`, exact result, clean Git, worker exited |
| ZCode | `zcode-acp --zcode-path <installed-runtime> --no-browser` | PASS | `156080f88ed84a013fb26d93e5138230732d2ef0e2b5b10a7c3deb501d3548e9` | domestic BigModel provider, ACP v1, `end_turn`, exact result, clean Git, worker exited |

## Claude Code

The pinned official adapter completed the real read-only drill. Its profile may select
ACP when `npx` is executable; `ULTRA_DELEGATE_FORCE_CLI=1` remains recovery.

## Codex

The pinned official adapter completed the real read-only drill. A nonzero adapter exit
caused by client-owned stdin shutdown remains recorded separately and does not overturn
an already validated protocol terminal and exact result.

## OpenCode

The native stdio server completed the real read-only drill through `opencode acp`.

## Grok Build

Grok emits bounded creation-time metadata before returning `session/new`. Ultra accepts
only four metadata update kinds at that point, caps the transient buffer at 32 messages
and 256 KiB, and validates each buffered session ID after the response. Early content,
tool traffic, mismatched identity, or overflow remains a typed failure.

## Kimi Code

Kimi 1.49.0 completed an owner-authenticated, read-only ACP provider session and returned
the exact Ultra result. Its profile may select native `kimi acp` when executable.

## ZCode

Ultra resolves independently installed `zcode-acp` v0.1.0 source commit
`42fe149d4b501469343c01f23ba3801832306d53`, the digest-bound Ultra compatibility patch
`174dfd0feafe84320556a84b5ae08b10e44c5515fea4992fd1d58af54cee4e3d`, and installed
ZCode CLI 0.16.5. The patch answers the new `session/requestRuntimePreferences` request
that otherwise deadlocks upstream v0.1.0 during `session/create`. Locked Rust tests,
the 0.16.5 regression, patched fake app-server E2E, release build, installed binary
digest, exact bridge build marker, and the real provider session all pass.

Authentication uses the Owner's existing domestic BigModel Coding Plan provider at
`https://open.bigmodel.cn/api/anthropic` with model `GLM-5.2`; it does not use the
international Z.AI OAuth flow. Credential values are absent from this report and its
receipt. The transport remains `experimental` because the downstream ZCode app-server
is not a public stability contract.

## Recovery

- Missing adapter, bridge, candidate identity, protocol version, or evidence returns a
  typed CLI fallback reason before provider execution. If `session/new` reports
  `acp_auth_required` before a prompt is sent, Ultra invokes the bounded CLI fallback
  once; it never retries any other ACP failure.
- `ULTRA_DELEGATE_FORCE_CLI=1` selects the bounded CLI path explicitly.
- A failed or stale Host receipt is replaced only by a fresh bounded drill for that Host.
- Raw receipt bytes remain repository evidence under `.ultra/evidence/`; this packaged
  report carries their SHA-256 bindings without packaging private provider output.
