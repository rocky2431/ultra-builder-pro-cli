'use strict';

/**
 * Canonical Ultra Builder Pro package boundary.
 *
 * Adapters must build from this allowlist. A new directory under skills/ or
 * hooks/ is not packaged until it is deliberately classified here.
 */

const CORE_PUBLIC_SKILLS = Object.freeze([
  'ultra-init',
  'ultra-research',
  'ultra-plan',
  'ultra-dev',
  'ultra-test',
  'ultra-review',
  'ultra-deliver',
  'ultra-status',
  'ultra-think',
  'ultra-change',
  'ultra-doctor',
]);

const PUBLIC_CAPABILITY_MODES = Object.freeze({
  'ultra-init': 'setup',
  'ultra-research': 'workflow',
  'ultra-plan': 'workflow',
  'ultra-dev': 'workflow',
  'ultra-test': 'workflow',
  'ultra-review': 'workflow',
  'ultra-deliver': 'workflow',
  'ultra-status': 'read_only',
  'ultra-think': 'reasoning',
  'ultra-change': 'workflow',
  'ultra-doctor': 'diagnostic',
});

const PUBLIC_CAPABILITY_GRAPH = Object.freeze(Object.fromEntries(
  CORE_PUBLIC_SKILLS.map((name) => [
    name,
    Object.freeze({
      mode: PUBLIC_CAPABILITY_MODES[name],
      activation: 'explicit_only',
      next_capability_source: 'host_model_from_ultra_context',
      recommendation_owner: 'host_model',
      selection_owner: 'user',
      automatic_invocation: false,
    }),
  ]),
));

const INTERNAL_AGENT_SKILLS = Object.freeze([
  'code-review-expert',
  'security-rules',
  'integration-rules',
  'testing-rules',
]);

const SUPPORTED_RUNTIMES = Object.freeze(['claude', 'opencode', 'codex', 'kimi']);

const COLLAB_SKILLS_BY_RUNTIME = Object.freeze({
  claude: Object.freeze(['codex-collab', 'ultra-verify']),
  codex: Object.freeze(['cc-collab', 'ultra-verify']),
  opencode: Object.freeze(['cc-collab', 'codex-collab', 'ultra-verify']),
  kimi: Object.freeze(['cc-collab', 'codex-collab', 'ultra-verify']),
});

const MCP_DEPENDENT_SKILLS = Object.freeze([
  'ultra-init',
  'ultra-research',
  'ultra-change',
  'ultra-plan',
  'ultra-dev',
  'ultra-test',
  'ultra-review',
  'ultra-deliver',
  'ultra-status',
  'ultra-doctor',
]);

const WORKFLOW_HOOK_FILES = Object.freeze([
  'active_task_context.py',
  'context_spine.py',
  'health_check.py',
  'pre_stop_check.py',
  'runtime_paths.py',
  'subagent_tracker.py',
  'workflow_checkpoint.py',
  'workflow_context.py',
  'workflow_resume.py',
]);

const RUNTIME_WORKER_FILES = Object.freeze([
  'session-close-journal-worker.cjs',
  'doctor-backup-worker.cjs',
]);

const RUNTIME_SUPPORT_FILES = Object.freeze([
  'archive-mutation-worker.py',
]);

function skillsForRuntime(runtime) {
  const collab = COLLAB_SKILLS_BY_RUNTIME[runtime];
  if (!collab) throw new Error(`unsupported Ultra runtime: ${runtime}`);
  return [...CORE_PUBLIC_SKILLS, ...INTERNAL_AGENT_SKILLS, ...collab];
}

function isSupportedRuntime(runtime) {
  return SUPPORTED_RUNTIMES.includes(runtime);
}

function skillPolicy(name) {
  const packaged = SUPPORTED_RUNTIMES.some((runtime) => skillsForRuntime(runtime).includes(name));
  if (!packaged) throw new Error(`unknown packaged Ultra skill: ${name}`);
  return {
    userInvocable: !INTERNAL_AGENT_SKILLS.includes(name),
    allowImplicitInvocation: false,
    requiresUltraMcp: MCP_DEPENDENT_SKILLS.includes(name),
  };
}

module.exports = {
  CORE_PUBLIC_SKILLS,
  PUBLIC_CAPABILITY_GRAPH,
  INTERNAL_AGENT_SKILLS,
  SUPPORTED_RUNTIMES,
  COLLAB_SKILLS_BY_RUNTIME,
  MCP_DEPENDENT_SKILLS,
  RUNTIME_SUPPORT_FILES,
  WORKFLOW_HOOK_FILES,
  RUNTIME_WORKER_FILES,
  isSupportedRuntime,
  skillPolicy,
  skillsForRuntime,
};
