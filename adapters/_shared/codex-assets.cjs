'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');
const {
  CORE_PUBLIC_SKILLS,
  INTERNAL_AGENT_SKILLS,
  WORKFLOW_HOOK_FILES,
  skillsForRuntime,
} = require('./runtime-assets.cjs');

const { parse: parseFrontmatter } = require('./frontmatter.cjs');
const {
  copyTree,
  ensureDir,
  listRelative,
  removeTree,
  writeAtomic,
} = require('./file-ops.cjs');

const PLUGIN_NAME = 'ultra-builder-pro';
const MANAGED_MARKER = 'Managed by Ultra Builder Pro Codex adapter.';
const CODEX_NATIVE_MCP_REPLACEMENTS = Object.freeze({
  'review.run': {
    surface: 'native_custom_agents',
    replacement: '$ultra-builder-pro:ultra-review with the installed review-* agents',
  },
  'review.verdict': {
    surface: 'native_custom_agents',
    replacement: 'review-coordinator synthesis using the Ultra unified review artifact',
  },
  'impact.radius': {
    surface: 'codex_code_discovery',
    replacement: 'indexed code graph tools when current, otherwise targeted repository reads',
  },
  'impact.changes': {
    surface: 'codex_code_discovery',
    replacement: 'git diff plus indexed code graph tools when current',
  },
  'impact.dependents': {
    surface: 'codex_code_discovery',
    replacement: 'indexed caller/dependency tracing when current, otherwise targeted repository search',
  },
  'skill.resolve': {
    surface: 'plugin_skill_discovery',
    replacement: 'Codex plugin skill discovery with explicit $ultra-builder-pro:<skill> invocation',
  },
  'skill.manifest': {
    surface: 'plugin_skill_discovery',
    replacement: 'the installed plugin skill SKILL.md and agents/openai.yaml contract',
  },
  'ask.question': {
    surface: 'direct_user_interaction',
    replacement: 'ask the user directly, or request_user_input when that Codex surface is available',
  },
  'ask.menu': {
    surface: 'direct_user_interaction',
    replacement: 'present a concise choice directly, or request_user_input when that Codex surface is available',
  },
});
const COMMAND_NAMES = Object.freeze(CORE_PUBLIC_SKILLS.filter((name) => name !== 'ultra-review'));
const SKILL_REFERENCE_NAMES = Object.freeze([
  ...COMMAND_NAMES,
  'cc-collab',
  'gemini-collab',
  'ultra-review',
  'ultra-verify',
]);
const INTERNAL_SKILLS = new Set(INTERNAL_AGENT_SKILLS);
const CODEX_PRIMARY_SKILLS = new Set([...COMMAND_NAMES, 'ultra-review']);
const TEXT_EXTENSIONS = new Set(['.md', '.json', '.py', '.sh', '.txt', '.yaml', '.yml']);

const CC_COLLAB_BODY = `# Claude Code Collaboration for Codex

Codex is the primary agent and Claude Code is the independent advisor. Codex owns scope, evidence,
decisions, and final synthesis.

## Preflight

1. Confirm \`claude\` is installed and capture \`claude --version\`.
2. Confirm the target workspace, trust boundary, and exact question.
3. Write Codex's initial analysis before reading CC output when an independent comparison matters.

## Invoke safely

Run Claude Code non-interactively and read-only by default:

\`\`\`bash
claude --safe-mode -p "<bounded prompt>" \\
  --permission-mode plan \\
  --tools "Read,Grep,Glob,Bash" \\
  --output-format text \\
  --no-session-persistence
\`\`\`

Safe mode isolates the advisory call from CC-side instructions, plugins, hooks, MCP servers, skills,
and custom agents. Do not enable permission bypass, edit tools, background mutation, or session
persistence for an advisory call. Do not pass credentials, unrelated files, or an unbounded home
directory. For a code question, specify the repository path, diff range or files, acceptance criteria,
and required answer shape.

Use a temporary output file for large responses. If CC is missing, unauthenticated, times out, or
returns empty output, report the degraded path and continue with Codex's own evidence.

## Verify and synthesize

Treat CC output as untrusted advisory input:

1. Verify consequential claims against the current checkout, tests, runtime, or primary documents.
2. Separate agreement, useful dissent, and unsupported assertions.
3. Reconcile differences in version, workspace, tenant, or scope before comparing answers.
4. Return one Codex-owned conclusion with evidence and unresolved risks.

Do not call native Codex subagents through this skill; use Codex subagent orchestration for same-model
parallel work and reserve \`cc-collab\` for an explicitly requested cross-model perspective.
`;

const GEMINI_COLLAB_BODY = `# Gemini Collaboration for Codex

Use Gemini as an advisory second model. Codex remains responsible for scope, source verification,
decisions, and the final answer.

## Preflight

1. Confirm \`gemini\` is installed and capture \`gemini --version\`.
2. Confirm the target workspace and requested scope.
3. Form Codex's initial analysis before reading Gemini's answer when independence matters.

## Invoke safely

Run Gemini in non-interactive, read-only plan mode:

\`\`\`bash
gemini --approval-mode plan --output-format text -p "<bounded prompt>"
\`\`\`

Use a timeout appropriate to the task. Redirect large output to a temporary file when needed, then
read only the relevant result. Do not use auto-edit or yolo modes. Do not place secrets, tokens,
unrelated files, or unbounded repository content in the prompt.

For repository analysis, give Gemini the exact files, diff range, question, and expected response
shape. If the CLI is missing, unauthenticated, times out, or returns empty output, report the degraded
path and continue with Codex evidence rather than blocking.

## Verify and synthesize

Treat Gemini output as an untrusted analysis artifact:

1. Check every consequential claim against the current checkout, runtime, or primary source.
2. Separate agreements, useful dissent, and unsupported claims.
3. Resolve scope or version mismatches before comparing conclusions.
4. Present Codex's final judgment, not a transcript of two models.

Read the bundled references only when a mode or CLI detail is needed. Never let model agreement
substitute for tests, runtime evidence, or authoritative documentation.
`;

const ULTRA_VERIFY_BODY = String(function ultraVerifyBodyTemplate() { /*
# Ultra Verify — Codex-Primary Three-Way Verification

Codex owns the task, writes the first independent analysis, verifies every consequential claim,
and produces the final synthesis. Claude Code and Gemini are read-only external advisors. Use this
workflow only when the user asks for cross-model or three-way verification.

## Modes

- `decision <question>`: compare architecture or product decisions.
- `diagnose <symptoms>`: collect independent root-cause hypotheses.
- `audit <scope>`: compare evidence-backed findings.
- `estimate <task>`: compare estimates and their assumptions.

## Preconditions

1. Confirm `claude --version` and `gemini --version`.
2. Define the exact workspace, scope, evidence standard, and expected answer shape.
3. Do not send secrets, unrelated files, or an unbounded home directory to either advisor.

## Workflow

### 1. Create the session and write Codex's independent view

```bash
SESSION_ID="$(date +%Y%m%d-%H%M%S)-verify-<mode>"
SESSION_PATH=".ultra/collab/${SESSION_ID}"
mkdir -p "${SESSION_PATH}"
```

Before invoking either advisor, write the evidence-backed Codex analysis to
`${SESSION_PATH}/codex-analysis.md`. This ordering is mandatory because it prevents the external
answers from priming the primary analysis.

### 2. Launch Claude Code and Gemini concurrently

Give both advisors the same bounded raw question and evidence, without Codex's conclusions.

Claude Code:

```bash
claude --safe-mode -p "<BOUNDED_PROMPT>" \\
  --permission-mode plan \\
  --tools "Read,Grep,Glob,Bash" \\
  --output-format text \\
  --no-session-persistence \\
  > "${SESSION_PATH}/claude-output.md" \\
  2> "${SESSION_PATH}/claude-error.log"
```

Gemini:

```bash
gemini --approval-mode plan --output-format text -p "<BOUNDED_PROMPT>" \\
  > "${SESSION_PATH}/gemini-output.md" \\
  2> "${SESSION_PATH}/gemini-error.log"
```

Start the two commands with parallel `exec_command` calls and a short initial yield. If a command
returns a live session id, poll it with `write_stdin` in bounded intervals. Do not use YOLO,
auto-edit, permission bypass, or write-capable external tools.

### 3. Collect only completed outputs

Wait for both CLI sessions to finish or reach their explicit timeout. The bundled
`scripts/verify_wait.py` can verify file stability for automation, but Codex must not perform one
blocking wait longer than 60 seconds. Read an output only when it is non-empty; retain the matching
error log as evidence when a CLI fails.

### 4. Verify and synthesize

Compare `codex-analysis.md`, `claude-output.md`, and `gemini-output.md`:

1. Verify claims against the current checkout, runtime, tests, or primary documentation.
2. Separate consensus, majority views, useful dissent, and unsupported assertions.
3. Explain scope, version, or assumption differences before scoring agreement.
4. Write `${SESSION_PATH}/synthesis.md` and `metadata.json`, then present one Codex-owned answer.

Use the bundled confidence rules. Three agreeing, independently verified views are consensus; two
are a majority; three materially different answers are no consensus and require decomposition or
more evidence. Model agreement never overrides failing tests or authoritative runtime evidence.

## Degraded operation

- One advisor fails: continue with Codex plus the available advisor and name the missing view.
- Both advisors fail: return Codex-only analysis with an explicit single-source warning.
- Never block the user's task solely because an external CLI is absent, unauthenticated, or slow.

## Session files

```text
.ultra/collab/<SESSION_ID>/
  codex-analysis.md
  claude-output.md
  claude-error.log
  gemini-output.md
  gemini-error.log
  metadata.json
  synthesis.md
```

Read the bundled references for mode-specific prompts, scoring, metadata, and automation details.
*/ }).match(/\/\*([\s\S]*?)\*\//)[1].trim();

const ULTRA_VERIFY_FLOW = String(function ultraVerifyFlowTemplate() { /*
# Codex-Native Orchestration Flow

## 1. Primary analysis

Create `.ultra/collab/<SESSION_ID>/` and write `codex-analysis.md` before reading any external
answer. Record the mode, scope, checkout, and evidence boundary.

## 2. Parallel advisors

Launch Claude Code in `--safe-mode --permission-mode plan` and Gemini in
`--approval-mode plan` through separate `exec_command` calls. Redirect their output to
`claude-output.md` and `gemini-output.md`. If a call yields a session id, poll with
`write_stdin` in bounded intervals; do not grant either advisor mutation authority.

## 3. Completion gate

Proceed only after both sessions have completed or timed out. For automation, run:

```bash
python3 ~/plugins/ultra-builder-pro/skills/ultra-verify/scripts/verify_wait.py \\
  "${SESSION_PATH}" --timeout 1200
```

Run the waiter as a yielded exec session and poll it; never hold one blocking tool call for more
than 60 seconds. Its JSON reports `claude` and `gemini` as `complete`, `failed`, `empty`, or
`pending`.

## 4. Synthesis

Read `codex-analysis.md` plus each completed advisor output. Verify consequential claims, compute
consensus using `confidence-system.md`, and write `synthesis.md` plus:

```json
{
  "id": "<SESSION_ID>",
  "agent": "ultra-verify",
  "mode": "<mode>",
  "models": {"codex": "<primary>", "claude": "<advisor>", "gemini": "<advisor>"},
  "scope": "<scope>",
  "timestamp": "<ISO 8601>",
  "confidence": "<consensus|majority|no_consensus>",
  "degraded": false
}
```

If one advisor fails, cap the result at majority and name the missing perspective. If both fail,
set `degraded: true`, `agents_responded: ["codex"]`, and mark the result single-source.
*/ }).match(/\/\*([\s\S]*?)\*\//)[1].trim();

function titleCase(name) {
  const special = {
    'ai-collab-base': 'AI Collaboration Base',
    'cc-collab': 'Claude Code Collaboration',
    'gemini-collab': 'Gemini Collaboration',
    'use-railway': 'Use Railway',
  };
  if (special[name]) return special[name];
  return name.split('-').map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' ');
}

function replaceSlashCommand(text, command, replacement) {
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(
    new RegExp(`(^|[\\s\\x60(>])/${escaped}(?=$|[\\s\\x60,.;):])`, 'gm'),
    (_match, prefix) => `${prefix}${replacement}`,
  );
}

function adaptCodexPrimaryText(input, skillName) {
  let text = String(input);
  text = text.replaceAll('mcp__claude-in-chrome__*', 'the available Codex browser verification tools');
  text = text.replaceAll('claude_md_rule', 'agents_md_rule');
  text = text.replaceAll('claude-opus-4-6', '<codex-model>');
  text = text.replaceAll('Claude', 'Codex');
  text = text.replaceAll('TaskCreate/TaskUpdate', 'the Codex plan tool');
  text = text.replaceAll('TaskCreate', 'the Codex plan tool');
  text = text.replaceAll('TaskUpdate', 'the Codex plan tool');
  text = text.replaceAll('TaskList', 'the current Codex plan');
  text = text.replaceAll('TaskOutput', 'verbose subagent transcript output');
  text = text.replaceAll('run_in_background: true', 'native parallel execution');
  text = text.replaceAll('Bash tool', '`exec_command`');
  text = text.replaceAll('Bash calls', '`exec_command` calls');
  text = text.replaceAll('Read tool', 'targeted file reads');
  text = text.replaceAll('Write tool', '`apply_patch`');
  text = text.replaceAll('`ask.question`', 'a direct user question');
  text = text.replaceAll('ask.question', 'ask the user directly');
  text = text.replaceAll('Playwright via Bash', 'Playwright through `exec_command`');
  text = text.replaceAll('mcp__context7__query-docs', 'official documentation lookup');
  text = text.replaceAll('mcp__exa__web_search_exa', 'verified web search');
  text = text.replaceAll('Context7 MCP', 'official primary documentation');
  text = text.replaceAll('Context7/Exa', 'official primary documentation and verified web search');
  text = text.replaceAll('Context7', 'official primary documentation');
  text = text.replaceAll('Exa MCP', 'verified web search');
  text = text.replaceAll('a direct user question (or runtime `ask the user directly`)', 'ask the user directly');
  text = text.replaceAll('a direct user question (fallback: `ask the user directly` / CLI menu)', 'ask the user directly');
  text = text.replaceAll('questions via ask the user directly.', 'questions directly to the user.');
  text = text.replaceAll('using `the Codex plan tool`', 'with the Codex plan tool');
  text = text.replaceAll("via the runtime's native the Codex plan tool", 'with the Codex plan tool when available');
  text = text.replaceAll('`the Codex plan tool` → `status: "in_progress"`', 'Mark the current Codex plan item `in_progress`');
  text = text.replaceAll('`the Codex plan tool` → `status: "completed"`', 'Mark the current Codex plan item `completed`');
  text = text.replaceAll('`the current Codex plan` → resume from last incomplete step', 'Resume from the first incomplete item in the current Codex plan');
  text = text.replaceAll('`the Codex plan tool`', 'the Codex plan tool');

  if (skillName === 'ultra-init') {
    text = text.replace(
      /MCP 不可达时回退[^。]*。/,
      'MCP 不可达时只使用插件内置的可验证 CLI 初始化路径；不得手写投影文件。',
    );
    text = text.replace(
      /- \*\*无 Codex 独占依赖\*\*[：:][\s\S]*?(?=\n- \*\*模板内置)/,
      '- **Codex-native boundary**: use the bundled `task.init_project` MCP tool; the plugin-local CLI below is only the verified initialization fallback.',
    );
    text = text.replace(
      /在调 `task\.init_project` 之前，调用方（Codex \/ CLI \/ SDK）需要先判断：/,
      '在调 `task.init_project` 之前，Codex 需要先判断：',
    );
    text = text.replace(
      /- 如果调用方是 Codex，可在此用 the Codex plan tool 跟踪 Step 0–4 的 session 内进度\n  （这是 runtime 的 session-local 跟踪，不走 MCP）/,
      '- 多步初始化可用 Codex plan 跟踪；持久项目状态仍只通过 Ultra MCP 写入。',
    );
    text = text.replace(
      /交互渠道：[\s\S]*?(?=\n确认 4 个问题：)/,
      '交互渠道：直接向用户提问；不要调用未注册的人机交互 MCP tool。\n',
    );
    text = text.replace(
      /\*\*CLI 回退路径\*\*[\s\S]*?(?=\n\*\*错误处理\*\*)/,
      `**插件内置 CLI 回退路径**（只在 MCP 启动失败时使用）：

\`\`\`bash
node ~/plugins/ultra-builder-pro/runtime/ultra-tools.cjs task init-project \\
  --target-dir "$TARGET" \\
  --project-name "$NAME" \\
  --project-type "$TYPE" \\
  --stack "$STACK"
\`\`\`

该 CLI 与 MCP 使用同一模板和校验规则。不得改写 \`.ultra/tasks/tasks.json\` 来模拟成功。
`,
    );
    text = text.replace(
      /## 调用方式（按 runtime）[\s\S]*?(?=\n## 输出锚点)/,
      '## Codex 调用方式\n\n在 Codex 中显式调用 `$ultra-builder-pro:ultra-init`，并在同一条任务消息中提供项目名、类型、技术栈或 git 约束。\n',
    );
    text = text.replace(
      /- \*\*不\*\*写入 state\.db（state\.db 由第一次 MCP 写操作或显式 `ultra-tools db init` 触发）/,
      '- **不**直接写入 state.db；它由第一次 Ultra MCP 状态写操作初始化。',
    );
    text = text.replaceAll('不再依赖 `~/.codex/.ultra-template/`', '不依赖任何用户目录模板');
  }

  if (skillName === 'ultra-plan') {
    text = text.replace(
      /Interactive prompt uses[\s\S]*?(?=\n\n\*\*Dual-scale effort)/,
      'Ask the user directly in Codex and record the selected posture.',
    );
    text = text.replace(
      /\*\*CLI fallback\*\* \(per task\):[\s\S]*?(?=\nAfter each `task\.create`)/,
      '**Failure boundary**: if the bundled MCP cannot execute `task.create`, stop and report the MCP error. Do not write state.db or its JSON/Markdown projections directly.\n\n',
    );
    text = text.replace(
      /## MCP → CLI fallback matrix[\s\S]*?(?=\n## What this skill DOES NOT do)/,
      `## Codex runtime boundary

- Ask scope and approval questions directly in the Codex conversation.
- Persist tasks only through bundled MCP \`task.create\` or \`task.parse_prd\`.
- If that MCP is unavailable, stop the state mutation with evidence; the legacy CLI does not
  implement task creation and is not a valid fallback.
`,
    );
  }

  if (skillName === 'ultra-dev') {
    text = text.replace(
      /## Design decisions vs pre-Phase-3[\s\S]*?(?=\n## Prerequisites)/,
      `## Codex-native execution boundaries

- Status changes use bundled MCP \`task.update\`; projected JSON and frontmatter are read-only.
- Review uses \`$ultra-builder-pro:ultra-review\` and the installed native Codex custom agents.
  The active MCP server does not expose a server-side review worker.
- Recovery uses the Codex plan plus \`.ultra/workflow-state.json\`, with the bundled compact hooks.
  The active MCP server does not expose a checkpoint tool, and no manual compact is required.
`,
    );
    text = text.replaceAll(
      '**CLI fallback**: `ultra-tools task update <id> --status in_progress`.',
      '**Failure boundary**: if `task.update` is unavailable, stop; do not edit state.db or projections directly.',
    );
    text = text.replaceAll(
      '**CLI fallback**: `ultra-tools task update <id> --status completed`.',
      '**Failure boundary**: if `task.update` is unavailable, stop; do not mark the projection completed manually.',
    );
    text = text.replace(
      /\*\*Subagent isolation \(complexity ≥ 7\)\*\*:[\s\S]*?subagent returns summary\./,
      '**Subagent isolation (complexity ≥ 7)**: use a bounded installed Codex custom agent only when the Subagent Policy or this invoked workflow authorizes delegation; the parent retains decisions and verification.',
    );
    text = text.replace(
      /### Step 4\.4 — Pre-Review Checkpoint[\s\S]*?(?=\n### Step 4\.5)/,
      `### Step 4.4 — Pre-Review Checkpoint

Atomically write \`.ultra/workflow-state.json\` with \`step=4.5\`,
\`status=pre_review\`, the task id, branch, and timestamp. Mark the matching Codex plan item
complete. The PreCompact/PostCompact hooks preserve and restore this checkpoint automatically;
do not require the user to compact or call a nonexistent checkpoint tool.
`,
    );
    text = text.replace(
      /### Step 4\.5 — Ultra Review \(MANDATORY\)[\s\S]*?(?=\n\*\*MAX_REVIEW_ITERATIONS)/,
      `### Step 4.5 — Ultra Review (MANDATORY)

Invoke \`$ultra-builder-pro:ultra-review all\`. That skill selects and dispatches the installed
native Codex review agents, waits on their structured files, and owns \`SUMMARY.json\`. Do not call
an unregistered review MCP tool or shell out to another Codex process as a substitute.

`,
    );
    text = text.replace(
      /## MCP → CLI fallback matrix[\s\S]*?(?=\n## What this skill DOES NOT do)/,
      `## Codex runtime boundary

| Purpose | Authoritative Codex path |
|---------|--------------------------|
| Select/read/update task | bundled MCP \`task.list\`, \`task.get\`, \`task.update\` |
| Pre-review recovery | Codex plan + \`.ultra/workflow-state.json\` + compact hooks |
| Review | \`$ultra-builder-pro:ultra-review\` + native custom agents |
| Human decision | ask the user directly |

If a required task MCP operation fails, stop and report it; never fall back to direct database or
projection writes.
`,
    );
    text = text.replace(
      /- Does NOT assume `review\.run` or `session\.checkpoint` are wired — fallbacks are first-class/,
      '- Does NOT call unregistered review or checkpoint MCP tools.',
    );
  }

  if (skillName === 'ultra-test') {
    text = text.replace(
      /## MCP → CLI fallback matrix[\s\S]*?(?=\n## What this skill DOES NOT do)/,
      `## Codex runtime boundary

- Read task completion through bundled MCP \`task.list\`.
- Ask before risky auto-fixes directly in the Codex conversation.
- If task state is unavailable, report the missing gate rather than trusting a projection alone.
`,
    );
  }

  if (skillName === 'ultra-deliver') {
    text = text.replace(
      /## MCP → CLI fallback matrix[\s\S]*?(?=\n## What this skill DOES NOT do)/,
      `## Codex runtime boundary

Ask the user directly before committing, tagging, pushing, or overriding the version bump. These are
external repository mutations; never infer approval from a prior read-only or test request.
`,
    );
  }

  if (skillName === 'ultra-status') {
    text = text.replace(
      /\*\*CLI fallback\*\*: `ultra-tools task list` \+ `ultra-tools session list`\./,
      '**Failure boundary**: if the bundled task/session MCP tools are unavailable, report those panels as unavailable; do not trust projections as authority.',
    );
    text = text.replace(
      /\*\*Output block\*\*:[\s\S]*?(?=\n## Single-task mode)/,
      `**Output block**: name the concrete next skill and use its namespaced Codex invocation, for
example \`$ultra-builder-pro:ultra-dev\`. If a fresh context would help, recommend starting a new
Codex task; do not emit a legacy slash-command placeholder.

`,
    );
    text = text.replace(
      /## MCP → CLI fallback matrix[\s\S]*?(?=\n## Cost panel)/,
      `## Codex data paths

| Purpose | Path |
|---------|------|
| List/detail tasks | bundled MCP \`task.list\` / \`task.get\` |
| Cost panel | \`node ~/plugins/ultra-builder-pro/runtime/ultra-tools.cjs status --cost --json --since 7d\` |

Task projections are not an authority fallback. If the MCP is unavailable, label the task panel
unavailable while still reporting file and git evidence.
`,
    );
    text = text.replaceAll(
      '`ultra-tools status --cost --json`',
      '`node ~/plugins/ultra-builder-pro/runtime/ultra-tools.cjs status --cost --json`',
    );
  }

  if (skillName === 'ultra-think') {
    text = text.replace(
      /Every factual claim about tech\/API\/best-practices must be verified via:[\s\S]*?(?=\n\nLabel each assertion:)/,
      `Every factual claim about technology, APIs, or current behavior must use the best available
primary evidence in this order:
- current repository or installed source;
- official primary documentation;
- web search when the fact may have changed or local evidence is insufficient.
`,
    );
    text = text.replaceAll(
      'docs via Context7/Exa',
      'official primary documentation or verified web sources',
    );
    text = text.replace(
      /## MCP → CLI fallback matrix[\s\S]*?(?=\n## What this skill DOES NOT do)/,
      `## Codex interaction boundary

Ask clarifying questions directly in the Codex conversation. This reasoning workflow is read-only
and does not require an interactive MCP or legacy CLI menu.
`,
    );
  }

  if (skillName === 'ultra-review') {
    text = text.replaceAll('### Phase 3: Background Execution', '### Phase 3: Parallel Native Agent Execution');
    text = text.replaceAll('**Step 4b: Launch coordinator in background:**', '**Step 4b: Delegate coordination:**');
    text = text.replaceAll('in **background mode** (`native parallel execution`)', 'concurrently with native Codex subagent orchestration');
    text = text.replaceAll('using multiple native Codex subagent orchestration calls in a single message', 'using the installed native Codex custom agents');
    text = text.replaceAll('Set `native parallel execution` on every Task call.', 'Dispatch every selected custom agent concurrently and keep each delegated scope bounded.');
    text = text.replaceAll('NEVER call verbose subagent transcript output for any review agent', 'Do not copy verbose subagent transcripts into the parent context');
    text = text.replaceAll('Call `review_wait.py` IMMEDIATELY — do NOT process idle notifications', 'Use `review_wait.py` as the file-completion gate before synthesis');
    text = text.replaceAll('Ignore all agent idle/completion messages between launch and wait script return', 'Treat completion messages only as lifecycle evidence; findings still come from the JSON files');
    text = text.replaceAll('Launch review-coordinator with `native parallel execution`:', 'After reviewer completion, delegate coordination to the native `review-coordinator` agent:');
    text = text.replaceAll('Use Bash to block until all agents finish writing:', 'Run the waiter through `exec_command` with a short yield; if it returns a live session, poll in bounded intervals:');
    text = text.replaceAll('After launching background agents', 'After dispatching the review agents');
    text = text.replaceAll('The review agents write to files; you read from files.', 'The review agents write findings to files; the parent reads only the structured files and concise lifecycle acknowledgements.');
    text = text.replaceAll('The ONLY information path from agents is: wait script → Read SUMMARY.json', 'The authoritative finding path is: wait script → inspect SUMMARY.json');
    text = text.replaceAll('**Read SUMMARY.json**', '**Inspect SUMMARY.json**');
  }

  return text;
}

function adaptUltraVerifyAsset(input, rel) {
  if (rel === path.join('references', 'orchestration-flow.md')) return ULTRA_VERIFY_FLOW;

  let text = adaptHostText(String(input), '');
  if (rel === path.join('scripts', 'verify_wait.py')) {
    text = text.replaceAll('Codex', 'Claude Code');
    text = text.replaceAll('codex', 'claude');
    text = text.replaceAll('run_in_background', 'a yielded exec session');
    return text;
  }

  text = text.replaceAll('Claude', '__UBP_CODEX_PRIMARY__');
  text = text.replaceAll('Codex', 'Claude Code');
  text = text.replaceAll('__UBP_CODEX_PRIMARY__', 'Codex');
  text = text.replaceAll('claude-analysis.md', 'codex-analysis.md');
  text = text.replaceAll('codex-output.md', 'claude-output.md');
  text = text.replaceAll('codex-error.log', 'claude-error.log');
  text = text.replaceAll('codex-review', 'claude-review');
  text = text.replaceAll('"claude": "claude-opus-4-6"', '"codex": "<primary>"');
  text = text.replaceAll('"codex": "<model>"', '"claude": "<advisor>"');
  text = text.replaceAll('["claude"]', '["codex"]');
  text = text.replaceAll('Claude Code-only', 'Codex-only');
  text = text.replaceAll('Gemini and Claude Code in parallel (native parallel execution)', 'Claude Code and Gemini concurrently');
  text = text.replaceAll('run_in_background', 'native concurrent execution');
  text = text.replaceAll('Bash tool', '`exec_command`');
  text = text.replaceAll('Read tool', 'targeted file reads');
  return text;
}

function adaptSkillAsset(input, targetName, rel) {
  if (targetName === 'ultra-verify') return adaptUltraVerifyAsset(input, rel);
  return adaptHostText(input, targetName);
}

function adaptHostText(input, skillName = '') {
  let text = String(input);
  text = text.replaceAll('codex-collab', 'cc-collab');
  text = text.replaceAll('CLAUDE.md', 'AGENTS.md');
  text = text.replaceAll('$CLAUDE_PLUGIN_ROOT/skills', '~/plugins/ultra-builder-pro/skills');
  text = text.replaceAll('~/.claude/skills', '~/plugins/ultra-builder-pro/skills');
  text = text.replaceAll('~/.codex/skills', '~/plugins/ultra-builder-pro/skills');
  text = text.replaceAll('~/.claude/hooks', '~/plugins/ultra-builder-pro/hooks');
  text = text.replaceAll('~/.claude', '~/.codex');
  text = text.replaceAll('AskUserQuestion', 'ask the user directly');
  text = text.replaceAll('Claude runtime', 'Codex runtime');
  text = text.replaceAll('Claude-only', 'Codex-only');
  text = text.replaceAll('Claude Task tool', 'Codex native subagent orchestration');
  text = text.replaceAll('Claude `Task` tool', 'Codex native subagent orchestration');
  text = text.replaceAll('Claude: `Task`', 'Codex: native subagent orchestration');
  text = text.replaceAll('Task tool', 'native Codex subagent orchestration');
  text = text.replaceAll('`Task`/`ultra-tools subagent run`', 'native Codex subagent orchestration / `ultra-tools subagent run`');
  text = text.replaceAll('`Task` →', 'native Codex subagent orchestration →');

  for (const skill of SKILL_REFERENCE_NAMES) {
    text = replaceSlashCommand(text, skill, `$ultra-builder-pro:${skill}`);
  }
  text = replaceSlashCommand(text, 'clear', 'start a new Codex task');

  if (CODEX_PRIMARY_SKILLS.has(skillName)) {
    text = adaptCodexPrimaryText(text, skillName);
  }

  if (skillName === 'gemini-collab' || skillName === 'ai-collab-base') {
    text = text.replaceAll("Claude's", "Codex's");
    text = text.replaceAll('Claude-only', 'Codex-only');
    text = text.replaceAll('Claude ', 'Codex ');
    text = text.replaceAll('Claude\n', 'Codex\n');
    text = text.replaceAll('--approval-mode yolo', '--approval-mode plan');
    text = text.replaceAll('--yolo', '--approval-mode plan');
    text = text.replaceAll('Bash tool', '`exec_command`');
    text = text.replaceAll('Read tool', 'targeted file reads');
    text = text.replaceAll('Write tool', '`apply_patch`');
  }

  if (skillName === 'learn') {
    text = text.replaceAll(
      '~/plugins/ultra-builder-pro/skills/learned-<name>-unverified/SKILL.md',
      '~/.agents/skills/learned-<name>-unverified/SKILL.md',
    );
    text = text.replaceAll(
      '~/plugins/ultra-builder-pro/skills/learned-<pattern-slug>-unverified/SKILL.md',
      '~/.agents/skills/learned-<pattern-slug>-unverified/SKILL.md',
    );
    text = text.replaceAll(
      '~/plugins/ultra-builder-pro/skills/learned-<slug>-unverified/SKILL.md',
      '~/.agents/skills/learned-<slug>-unverified/SKILL.md',
    );
    text = text.replaceAll(
      '~/plugins/ultra-builder-pro/skills/learned/<name>_unverified.md',
      '~/.agents/skills/learned-<name>-unverified/SKILL.md',
    );
    text = text.replaceAll(
      '~/plugins/ultra-builder-pro/skills/learned/<pattern-slug>_unverified.md',
      '~/.agents/skills/learned-<pattern-slug>-unverified/SKILL.md',
    );
    text = text.replaceAll(
      '~/plugins/ultra-builder-pro/skills/learned/<slug>_unverified.md',
      '~/.agents/skills/learned-<slug>-unverified/SKILL.md',
    );
    text = text.replaceAll('append the `_unverified` suffix to the filename', 'append `-unverified` to the skill directory name');
    text = text.replaceAll('Never overwrite an existing unverified file', 'Never overwrite an existing learned skill directory');
    text = text.replaceAll('remove the `_unverified` suffix', 'rename the directory to remove `-unverified` and update the frontmatter name');
    text = text.replaceAll('(`pattern-slug-2_unverified.md`)', '(`learned-pattern-slug-2-unverified/`)');
    text = text.replaceAll('Anything the user already wrote in AGENTS.md or similar project instructions', 'Anything already captured in AGENTS.md or equivalent project instructions');
    text = text.replace(
      /## MCP → CLI fallback matrix[\s\S]*?(?=\n## What this skill DOES NOT do)/,
      '## Codex approval boundary\n\nAsk the user directly before writing a learned skill. No MCP or legacy CLI interaction layer is required.\n',
    );
    text += `\n\n## Codex packaging requirement\n\nEach learned pattern must be a valid skill directory, not a loose Markdown file. The generated\n\`SKILL.md\` must start with only \`name\` and \`description\` frontmatter. Also create\n\`agents/openai.yaml\` with \`policy.allow_implicit_invocation: false\`. A new Codex task is required\nbefore the learned skill appears in discovery.\n`;
  }

  return text;
}

function adaptedDescription(sourceDescription, targetName) {
  const special = {
    'cc-collab': 'Ask Claude Code for an independent read-only analysis while Codex owns verification and synthesis. Use only when the user explicitly requests CC or Claude Code collaboration.',
    'gemini-collab': 'Ask Gemini CLI for an independent read-only analysis while Codex verifies and synthesizes. Use only when the user explicitly requests Gemini collaboration.',
    'ultra-verify': 'Run Codex-primary three-way verification with read-only Claude Code and Gemini advisors, then verify and synthesize the evidence.',
    'ultra-dev': 'Execute one Ultra task with Codex-native TDD, persistent task.update state, workflow checkpoints, and the native Ultra review agents.',
    'learn': 'Extract one reusable pattern from the current Codex task into a valid user skill, with explicit user approval before writing.',
  };
  return special[targetName] || adaptHostText(String(sourceDescription || `${titleCase(targetName)} workflow for Codex.`), targetName)
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSkillMarkdown(sourceText, sourceName, targetName) {
  const { fm, body } = parseFrontmatter(sourceText);
  let adaptedBody;
  if (targetName === 'cc-collab') adaptedBody = CC_COLLAB_BODY;
  else if (targetName === 'gemini-collab') adaptedBody = GEMINI_COLLAB_BODY;
  else if (targetName === 'ultra-verify') adaptedBody = ULTRA_VERIFY_BODY;
  else adaptedBody = adaptHostText(body, targetName);
  return yaml.dump({
    name: targetName,
    description: adaptedDescription(fm && fm.description, targetName),
  }, { lineWidth: -1, noRefs: true }).trimEnd()
    .replace(/^/, '---\n') + `\n---\n\n${adaptedBody.trim()}\n`;
}

function buildOpenAiYaml(name, description) {
  const implicit = !(
    COMMAND_NAMES.includes(name)
    || INTERNAL_SKILLS.has(name)
    || name === 'cc-collab'
    || name === 'gemini-collab'
    || name.startsWith('ultra-')
  );
  const short = description.replace(/\s+/g, ' ').trim().slice(0, 63).replace(/[\s.,;:]+$/, '');
  return yaml.dump({
    interface: {
      display_name: titleCase(name),
      short_description: short || `${titleCase(name)} for Codex`,
      default_prompt: `Use $ultra-builder-pro:${name} for this task and follow its workflow.`,
    },
    policy: { allow_implicit_invocation: implicit },
  }, { lineWidth: -1, noRefs: true });
}

function isTextFile(rel) {
  return TEXT_EXTENSIONS.has(path.extname(rel).toLowerCase());
}

function copySkill(sourceDir, targetDir, sourceName, targetName) {
  if (targetName === 'cc-collab') {
    ensureDir(targetDir);
    const sourceText = fs.readFileSync(path.join(sourceDir, 'SKILL.md'), 'utf8');
    const skillText = buildSkillMarkdown(sourceText, sourceName, targetName);
    writeAtomic(path.join(targetDir, 'SKILL.md'), skillText);
    const description = parseFrontmatter(skillText).fm.description;
    writeAtomic(path.join(targetDir, 'agents', 'openai.yaml'), buildOpenAiYaml(targetName, description));
    return;
  }

  copyTree(sourceDir, targetDir, {
    transform(original, rel) {
      if (rel === path.join('agents', 'openai.yaml')) return original;
      if (rel === 'SKILL.md') {
        return Buffer.from(buildSkillMarkdown(original.toString('utf8'), sourceName, targetName));
      }
      if (!isTextFile(rel)) return original;
      return Buffer.from(adaptSkillAsset(original.toString('utf8'), targetName, rel));
    },
  });
  const skillText = fs.readFileSync(path.join(targetDir, 'SKILL.md'), 'utf8');
  const description = parseFrontmatter(skillText).fm.description;
  writeAtomic(path.join(targetDir, 'agents', 'openai.yaml'), buildOpenAiYaml(targetName, description));
}

function buildCommandMap() {
  return Object.fromEntries(COMMAND_NAMES.map((name) => [`/${name}`, `$ultra-builder-pro:${name}`]));
}

function hookCommand(feature, ...args) {
  return [
    'python3 "$PLUGIN_ROOT/hooks/adapters/codex.py"',
    JSON.stringify(feature),
    ...args.map((arg) => JSON.stringify(arg)),
  ].join(' ');
}

function commandHook(feature, timeout, statusMessage, ...args) {
  return {
    type: 'command',
    command: hookCommand(feature, ...args),
    timeout,
    statusMessage,
  };
}

function buildHooksManifest() {
  return {
    hooks: {
      SessionStart: [
        { hooks: [commandHook('health_check.py', 5, 'Checking Ultra runtime')] },
        { hooks: [commandHook('workflow_context.py', 10, 'Loading active Ultra workflow')] },
      ],
      PreToolUse: [
        { matcher: 'Edit|Write|apply_patch', hooks: [commandHook('active_task_context.py', 3, 'Checking active Ultra task')] },
      ],
      PreCompact: [
        { matcher: 'manual|auto', hooks: [commandHook('workflow_checkpoint.py', 10, 'Saving Ultra workflow checkpoint')] },
      ],
      PostCompact: [
        { hooks: [commandHook('workflow_resume.py', 10, 'Restoring Ultra workflow checkpoint')] },
      ],
      Stop: [
        { hooks: [commandHook('pre_stop_check.py', 5, 'Checking Ultra completion gates')] },
      ],
      SubagentStart: [
        { hooks: [commandHook('subagent_tracker.py', 5, 'Tracking Ultra subagent', 'start')] },
      ],
      SubagentStop: [
        { hooks: [commandHook('subagent_tracker.py', 5, 'Tracking Ultra subagent', 'stop')] },
      ],
    },
  };
}

function copyHooks(repoRoot, pluginRoot) {
  const sourceRoot = path.join(repoRoot, 'hooks');
  const targetRoot = path.join(pluginRoot, 'hooks');
  ensureDir(targetRoot);
  for (const name of WORKFLOW_HOOK_FILES) {
    fs.copyFileSync(path.join(sourceRoot, name), path.join(targetRoot, name));
  }
  ensureDir(path.join(targetRoot, 'adapters'));
  fs.copyFileSync(
    path.join(sourceRoot, 'adapters', 'codex.py'),
    path.join(targetRoot, 'adapters', 'codex.py'),
  );
  writeAtomic(path.join(targetRoot, 'hooks.json'), JSON.stringify(buildHooksManifest(), null, 2) + '\n');
}

function buildMcpRuntime(repoRoot, pluginRoot, { runtime = 'codex' } = {}) {
  const source = path.join(repoRoot, 'mcp-server', 'server.cjs');
  const cliSource = path.join(repoRoot, 'adapters', '_shared', 'codex-ultra-tools-entry.cjs');
  const runtimeRoot = path.join(pluginRoot, 'runtime');
  const buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-codex-mcp-build-'));
  let nccCli;
  try {
    nccCli = require.resolve('@vercel/ncc/dist/ncc/cli.js');
  } catch (error) {
    throw new Error(`Ultra MCP bundling requires @vercel/ncc: ${error.message}`);
  }

  try {
    const bundled = spawnSync(process.execPath, [
      nccCli,
      'build',
      source,
      '-o',
      buildRoot,
      '--no-cache',
      '--quiet',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    if (bundled.error) throw bundled.error;
    if (bundled.status !== 0) {
      const detail = (bundled.stderr || bundled.stdout || '').trim();
      throw new Error(`ncc failed to bundle the Ultra MCP runtime${detail ? `: ${detail}` : ''}`);
    }
    copyTree(buildRoot, runtimeRoot);
  } finally {
    removeTree(buildRoot);
  }

  const cliBuildRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-codex-cli-build-'));
  try {
    const bundled = spawnSync(process.execPath, [
      nccCli,
      'build',
      cliSource,
      '-o',
      cliBuildRoot,
      '--no-cache',
      '--quiet',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    if (bundled.error) throw bundled.error;
    if (bundled.status !== 0) {
      const detail = (bundled.stderr || bundled.stdout || '').trim();
      throw new Error(`ncc failed to bundle the Ultra fallback CLI${detail ? `: ${detail}` : ''}`);
    }
    for (const rel of listRelative(cliBuildRoot)) {
      const target = rel === 'index.cjs'
        ? path.join(runtimeRoot, 'ultra-tools.cjs')
        : path.join(runtimeRoot, rel);
      ensureDir(path.dirname(target));
      fs.copyFileSync(path.join(cliBuildRoot, rel), target);
    }
  } finally {
    removeTree(cliBuildRoot);
  }

  const launcher = `'use strict';

const path = require('node:path');

process.env.UBP_RUNTIME_ROOT = path.resolve(__dirname, '..');

const { main } = require('./index.cjs');

main().catch((error) => {
  process.stderr.write(\`mcp-server fatal: \${error.message}\\n\`);
  process.exit(1);
});
`;
  writeAtomic(path.join(runtimeRoot, 'launch.cjs'), launcher);

  const sourceToolsFile = path.join(repoRoot, 'spec', 'mcp-tools.yaml');
  const upstreamManifest = yaml.load(fs.readFileSync(sourceToolsFile, 'utf8'));
  const { REGISTERED_TOOLS } = require(path.join(repoRoot, 'mcp-server', 'server.cjs'));
  const registered = new Set(REGISTERED_TOOLS);
  const liveFamilies = new Set(
    upstreamManifest.tools.filter((tool) => registered.has(tool.name)).map((tool) => tool.family),
  );
  const liveManifest = {
    ...upstreamManifest,
    info: {
      ...upstreamManifest.info,
      notes: `${upstreamManifest.info.notes.trim()}\n\n${runtime} bundled runtime: only tools registered by the MCP server are listed here.`,
    },
    families: upstreamManifest.families.filter((family) => liveFamilies.has(family.name)),
    tools: upstreamManifest.tools.filter((tool) => registered.has(tool.name)),
  };
  const specRoot = path.join(pluginRoot, 'spec');
  ensureDir(specRoot);
  writeAtomic(path.join(specRoot, 'mcp-tools.yaml'), yaml.dump(liveManifest, { lineWidth: -1, noRefs: true }));
  if (runtime === 'codex') {
    fs.copyFileSync(sourceToolsFile, path.join(specRoot, 'upstream-mcp-tools.yaml'));
    writeAtomic(path.join(specRoot, 'codex-capability-map.json'), JSON.stringify({
      runtime: 'codex',
      live_mcp_tools: REGISTERED_TOOLS,
      codex_native_replacements: CODEX_NATIVE_MCP_REPLACEMENTS,
    }, null, 2) + '\n');
  }
  const sourceSchema = path.join(repoRoot, 'spec', 'schemas', 'state-db.sql');
  const targetSchema = path.join(specRoot, 'schemas', 'state-db.sql');
  ensureDir(path.dirname(targetSchema));
  fs.copyFileSync(sourceSchema, targetSchema);

  const preferredTemplate = path.join(repoRoot, 'templates', '.ultra');
  const packagedTemplate = path.join(repoRoot, '.ultra-template');
  const templateRoot = fs.existsSync(preferredTemplate) ? preferredTemplate : packagedTemplate;
  if (!fs.existsSync(templateRoot)) {
    throw new Error(`Ultra project template missing from ${repoRoot}`);
  }
  copyTree(templateRoot, path.join(pluginRoot, 'templates', '.ultra'));

  return {
    launcher: path.join(runtimeRoot, 'launch.cjs'),
    bundle: path.join(runtimeRoot, 'index.cjs'),
    ultraTools: path.join(runtimeRoot, 'ultra-tools.cjs'),
  };
}

function pluginContentHash(pluginRoot, baseVersion) {
  const hash = crypto.createHash('sha256');
  hash.update(baseVersion);
  for (const rel of listRelative(pluginRoot)) {
    if (rel === path.join('.codex-plugin', 'plugin.json') || rel === '.ubp-managed') continue;
    hash.update(rel);
    hash.update(fs.readFileSync(path.join(pluginRoot, rel)));
  }
  return hash.digest('hex').slice(0, 12);
}

function buildPlugin({ repoRoot, pluginRoot }) {
  if (fs.existsSync(pluginRoot)) {
    const marker = path.join(pluginRoot, '.ubp-managed');
    if (!fs.existsSync(marker)) {
      throw new Error(`refusing to replace unmanaged plugin directory: ${pluginRoot}`);
    }
    removeTree(pluginRoot);
  }
  ensureDir(pluginRoot);

  const installedSkills = [];
  for (const name of skillsForRuntime('codex')) {
    const sourceDir = path.join(repoRoot, 'skills', name);
    if (!fs.existsSync(path.join(sourceDir, 'SKILL.md'))) {
      throw new Error(`missing allowlisted Codex skill: ${name}`);
    }
    copySkill(sourceDir, path.join(pluginRoot, 'skills', name), name, name);
    installedSkills.push(name);
  }

  copyHooks(repoRoot, pluginRoot);
  const mcpRuntime = buildMcpRuntime(repoRoot, pluginRoot);
  writeAtomic(path.join(pluginRoot, '.mcp.json'), JSON.stringify({
    mcpServers: {
      [PLUGIN_NAME]: {
        type: 'stdio',
        command: process.execPath,
        args: [mcpRuntime.launcher],
      },
    },
  }, null, 2) + '\n');
  writeAtomic(path.join(pluginRoot, 'command-map.json'), JSON.stringify(buildCommandMap(), null, 2) + '\n');
  if (fs.existsSync(path.join(repoRoot, 'LICENSE'))) {
    fs.copyFileSync(path.join(repoRoot, 'LICENSE'), path.join(pluginRoot, 'LICENSE'));
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const version = `${pkg.version}+codex.${pluginContentHash(pluginRoot, pkg.version)}`;
  const manifest = {
    name: PLUGIN_NAME,
    version,
    description: 'Codex-native Ultra Builder Pro workflows, agents, hooks, and MCP task state.',
    author: { name: typeof pkg.author === 'string' ? pkg.author : 'Ultra Builder Pro contributors' },
    homepage: pkg.homepage,
    repository: 'https://github.com/rocky2431/ultra-builder-pro-cli',
    license: pkg.license || 'MIT',
    keywords: ['codex', 'skills', 'agents', 'hooks', 'mcp', 'ultra-builder-pro'],
    skills: './skills/',
    mcpServers: './.mcp.json',
    interface: {
      displayName: 'Ultra Builder Pro',
      shortDescription: 'Codex-native engineering workflows and verification gates.',
      longDescription: 'Complete Codex adaptation of Ultra Builder Pro skills, command workflows, custom agents, lifecycle hooks, and project-local MCP state.',
      developerName: typeof pkg.author === 'string' ? pkg.author : 'Ultra Builder Pro contributors',
      category: 'Developer Tools',
      capabilities: ['Interactive', 'Write'],
      websiteURL: pkg.homepage,
      defaultPrompt: [
        'Initialize this project with the Ultra Builder Pro workflow.',
        'Run the Ultra review pipeline on my current changes.',
        'Show the current Ultra project status and next action.',
      ],
      brandColor: '#111827',
    },
  };
  writeAtomic(path.join(pluginRoot, '.codex-plugin', 'plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeAtomic(path.join(pluginRoot, '.ubp-managed'), JSON.stringify({ source: 'ubp', adapter: 'codex', version }, null, 2) + '\n');
  return { root: pluginRoot, version, skills: installedSkills.sort() };
}

function tomlMultiline(value) {
  const escaped = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"""/g, '\\"\\"\\"')
    .replace(/\r/g, '')
    .replace(/\u0000/g, '');
  return `"""\\\n${escaped.trim()}\n"""`;
}

function buildAgentToml(sourceText) {
  const { fm, body } = parseFrontmatter(sourceText);
  const name = fm.name;
  const description = adaptHostText(String(fm.description || `${name} Ultra Builder Pro agent.`), name)
    .replace(/\s+/g, ' ')
    .trim();
  let instructions = adaptHostText(body, name);
  instructions = instructions.replace(
    /Consult your agent memory[^\n]*/g,
    'Use the current checkout and parent-supplied context; do not assume persistent custom-agent memory.',
  );
  instructions = `You are a native Codex custom agent. Stay inside the delegated scope, preserve unrelated changes, and return concise evidence to the parent task.\n\n${instructions}`;
  return [
    `# ${MANAGED_MARKER}`,
    `name = ${JSON.stringify(name)}`,
    `description = ${JSON.stringify(description)}`,
    'model_reasoning_effort = "high"',
    `developer_instructions = ${tomlMultiline(instructions)}`,
    '',
  ].join('\n');
}

function installAgents({ repoRoot, configDir }) {
  const sourceRoot = path.join(repoRoot, 'agents');
  const targetRoot = path.join(configDir, 'agents');
  ensureDir(targetRoot);
  const installed = [];
  for (const file of fs.readdirSync(sourceRoot).filter((name) => name.endsWith('.md')).sort()) {
    const targetFile = path.join(targetRoot, file.replace(/\.md$/, '.toml'));
    if (fs.existsSync(targetFile)) {
      const existing = fs.readFileSync(targetFile, 'utf8');
      if (!existing.startsWith(`# ${MANAGED_MARKER}`)) {
        throw new Error(`refusing to overwrite unmanaged Codex agent: ${targetFile}`);
      }
    }
    writeAtomic(targetFile, buildAgentToml(fs.readFileSync(path.join(sourceRoot, file), 'utf8')));
    installed.push(path.basename(targetFile));
  }
  return { root: targetRoot, installed };
}

module.exports = {
  PLUGIN_NAME,
  MANAGED_MARKER,
  COMMAND_NAMES,
  adaptHostText,
  buildCommandMap,
  buildHooksManifest,
  buildMcpRuntime,
  buildPlugin,
  buildAgentToml,
  installAgents,
};
