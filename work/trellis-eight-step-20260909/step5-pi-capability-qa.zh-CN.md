## 1. Native facilities and evidence

- Pi has a native `tool_call` extension event that runs **after tool-call creation but before execution** and can return `{ block: true, reason }`.
  - Evidence: `docs/extensions.md:778–793`
  - Installed implementation: `dist/core/agent-session.js:223–247` and `dist/core/extensions/runner.js:746–777`.
- `event.input` is mutable, and mutations affect execution. Extension errors fail closed for tool calls.
- Native tools include `bash`, `read`, `write`, `edit`, `grep`, `find`, and `ls`; Bash uses a real local shell backend (`dist/core/tools/bash.js`).
- RPC provides prompt/event streaming and extension UI requests, but its direct `bash` RPC command executes immediately; it is not an Agent tool-call permission event.
- Pi has no native standard `fetch` Agent tool in the inspected tool-call vocabulary.
- Ultra’s `permissionDecision` is ACP-shaped: it requires `toolCall.kind`, `locations`, and offered permission `options`. Pi’s `tool_call` event supplies `toolName` and tool input, not that permission request structure.

These are source-proven facilities, not a runtime qualification of Pi.

## 2. Smallest feasible integration / capability gap

Pi can enforce a restricted worker’s modeled tool effects through a project/global extension that blocks relevant native Agent tool calls before execution. However, the existing `cli-driver.cjs` only spawns a process and captures stdout/stderr; it does not consume Pi RPC events or invoke `permissionDecision`.

Therefore, **the existing Pi surface cannot satisfy the contract unchanged using the existing CLI driver plus `permissionDecision`**. A thin Pi-specific event/extension integration would be required to:

- translate Pi tool calls into the Ultra decision vocabulary;
- record independently observed call-and-block events;
- preserve the existing writer, environment, fence, termination, and receipt boundaries.

That is a new integration seam, not an ACP adapter or transport, and it is not currently present. Native extensions also are not a sandbox: they execute with full system permissions, and direct RPC `bash` commands are outside Agent `tool_call` interception.

The existing Stage B contract remains unqualified for this path. This does not alter the retained ZCode Bash escape or Kimi SDK-write limitation.

## 3. Bash `curl` versus the required fetch effect

An independently observed Pi Agent Bash call such as `curl ...` being blocked by `tool_call` **before shell execution** proves that the Bash process/network effect did not occur.

But under the current kit it does **not** satisfy `agent_tool_network_denial`:

- the kit requires a permission event with `tool_kind: "fetch"` and a rejection;
- Pi would expose this as native `bash`/`execute`, not `fetch`;
- the kit explicitly derives the network dimension from `dimension('fetch')`.

Thus it can satisfy the shell-denial dimension (and provide useful supporting evidence for network non-effect), but not the current Agent-fetch dimension. Treating it as equivalent would be a contract reinterpretation, not proven runtime equivalence.
