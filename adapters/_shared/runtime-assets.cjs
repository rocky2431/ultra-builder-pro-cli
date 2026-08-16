'use strict';

/**
 * Canonical v0.26 package boundary.
 *
 * Skills carry semantic workflow. Hooks are optional acceleration and safety.
 * There is no prompt projection, worker registry, MCP kernel, or runtime daemon.
 */

const USER_INVOKED_SKILLS = Object.freeze([
  'ultra-init',
  'ultra-research',
  'ultra-change',
  'ultra-plan',
  'ultra-dev',
  'ultra-test',
  'ultra-deliver',
  'ultra-delegate',
]);

const MODEL_INVOKED_SKILLS = Object.freeze([
  'ultra-grilling',
  'ultra-domain-modeling',
  'ultra-tdd',
  'ultra-review',
  'ultra-think',
]);

const ROUTER_SKILLS = Object.freeze(['ultra-status']);
const GRANT_CONTINUABLE_SKILLS = Object.freeze([
  'ultra-research',
  'ultra-plan',
  'ultra-dev',
  'ultra-test',
  'ultra-deliver',
]);
const SUPPORTED_RUNTIMES = Object.freeze(['claude', 'opencode', 'codex', 'kimi', 'grok', 'zcode']);

const WORKFLOW_HOOK_FILES = Object.freeze([
  'session_context.py',
  'mid_workflow_recall.py',
  'compact_context.py',
  'post_edit_guard.py',
  'block_dangerous_commands.py',
]);

function skillsForRuntime(runtime) {
  if (!SUPPORTED_RUNTIMES.includes(runtime)) {
    throw new Error(`unsupported Ultra runtime: ${runtime}`);
  }
  return [...USER_INVOKED_SKILLS, ...MODEL_INVOKED_SKILLS, ...ROUTER_SKILLS];
}

function isSupportedRuntime(runtime) {
  return SUPPORTED_RUNTIMES.includes(runtime);
}

function skillPolicy(name) {
  if (!skillsForRuntime(SUPPORTED_RUNTIMES[0]).includes(name)) {
    throw new Error(`unknown packaged Ultra skill: ${name}`);
  }
  const modelInvoked = MODEL_INVOKED_SKILLS.includes(name);
  const grantContinuable = GRANT_CONTINUABLE_SKILLS.includes(name);
  return {
    userInvocable: !modelInvoked,
    allowImplicitInvocation: modelInvoked || grantContinuable,
  };
}

module.exports = {
  GRANT_CONTINUABLE_SKILLS,
  USER_INVOKED_SKILLS,
  MODEL_INVOKED_SKILLS,
  ROUTER_SKILLS,
  SUPPORTED_RUNTIMES,
  WORKFLOW_HOOK_FILES,
  isSupportedRuntime,
  skillPolicy,
  skillsForRuntime,
};
