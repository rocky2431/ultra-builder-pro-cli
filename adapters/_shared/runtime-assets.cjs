'use strict';

/**
 * Canonical Ultra Builder Pro package boundary.
 *
 * Adapters must build from this allowlist. A new directory under skills/ or
 * hooks/ is not packaged until it is deliberately classified here.
 */

const CORE_PUBLIC_SKILLS = Object.freeze([
  'learn',
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
  'ultra-change',
  'ultra-plan',
  'ultra-dev',
  'ultra-test',
  'ultra-review',
  'ultra-deliver',
  'ultra-status',
  'ultra-doctor',
]);

const RETIRED_SKILLS = Object.freeze([
  'agent-browser',
  'find-skills',
  'recall',
  'use-railway',
  'vercel-composition-patterns',
  'vercel-react-best-practices',
  'vercel-react-native-skills',
]);

const WORKFLOW_HOOK_FILES = Object.freeze([
  'active_task_context.py',
  'context_spine.py',
  'health_check.py',
  'pre_stop_check.py',
  'subagent_tracker.py',
  'workflow_checkpoint.py',
  'workflow_context.py',
  'workflow_resume.py',
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
  INTERNAL_AGENT_SKILLS,
  SUPPORTED_RUNTIMES,
  COLLAB_SKILLS_BY_RUNTIME,
  MCP_DEPENDENT_SKILLS,
  RETIRED_SKILLS,
  WORKFLOW_HOOK_FILES,
  isSupportedRuntime,
  skillPolicy,
  skillsForRuntime,
};
