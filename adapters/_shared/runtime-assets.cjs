'use strict';

/**
 * Canonical package and invocation boundary.
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
const PUBLIC_SKILL_INVOCATION_MODES = Object.freeze({
  'ultra-init': Object.freeze({
    create: 'explicit-entry',
    recover: 'explicit-entry',
  }),
  'ultra-research': Object.freeze({
    baseline: 'explicit-entry',
    'change-scoped': 'grant-continuable',
  }),
  'ultra-change': Object.freeze({
    intake: 'explicit-entry',
    'evidence-needed': 'explicit-entry',
    reconcile: 'grant-continuable',
    accepted: 'explicit-entry',
  }),
  'ultra-plan': Object.freeze({
    decompose: 'grant-continuable',
    recover: 'grant-continuable',
  }),
  'ultra-dev': Object.freeze({
    execute: 'grant-continuable',
    resume: 'grant-continuable',
    reopen: 'grant-continuable',
  }),
  'ultra-test': Object.freeze({
    audit: 'grant-continuable',
    reaudit: 'grant-continuable',
  }),
  'ultra-deliver': Object.freeze({
    reconcile: 'grant-continuable',
    finalize: 'explicit-entry',
  }),
  'ultra-delegate': Object.freeze({
    task: 'explicit-entry',
    research: 'explicit-entry',
    aggregate: 'explicit-entry',
  }),
  'ultra-status': Object.freeze({
    route: 'router',
    history: 'router',
    installation: 'router',
    delegation: 'router',
    recovery: 'router',
  }),
});
const GRANT_CONTINUABLE_SKILLS = Object.freeze(USER_INVOKED_SKILLS.filter((name) => (
  Object.values(PUBLIC_SKILL_INVOCATION_MODES[name]).includes('grant-continuable')
)));
/**
 * Coarse Host metadata is discovery, not authority. OpenCode and ZCode expose no routing
 * bit at all, so every public mode already proves its own entry inside the Skill body.
 * The bit is withheld only where the product requires the Owner to name the route: the
 * read-only Status router and Delegate's owner-authorized worker topology. Every other
 * public Skill stays discoverable, including `ultra-init` before `.ultra/` exists.
 * Native discovery is best-effort; `ubp run` explicitly enters Ultra before routing.
 */
const HOST_DISCOVERY_WITHHELD_SKILLS = Object.freeze(['ultra-delegate', 'ultra-status']);
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
  if (MODEL_INVOKED_SKILLS.includes(name)) {
    return {
      userInvocable: false,
      allowImplicitInvocation: true,
      invocationClasses: ['model-discipline'],
      modes: {},
    };
  }
  const modes = PUBLIC_SKILL_INVOCATION_MODES[name];
  const invocationClasses = [...new Set(Object.values(modes))];
  return {
    userInvocable: true,
    allowImplicitInvocation: !HOST_DISCOVERY_WITHHELD_SKILLS.includes(name),
    invocationClasses,
    modes,
  };
}

module.exports = {
  GRANT_CONTINUABLE_SKILLS,
  HOST_DISCOVERY_WITHHELD_SKILLS,
  USER_INVOKED_SKILLS,
  MODEL_INVOKED_SKILLS,
  PUBLIC_SKILL_INVOCATION_MODES,
  ROUTER_SKILLS,
  SUPPORTED_RUNTIMES,
  WORKFLOW_HOOK_FILES,
  isSupportedRuntime,
  skillPolicy,
  skillsForRuntime,
};
