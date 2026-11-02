'use strict';

const SUPPORTED_RUNTIMES = Object.freeze(['claude', 'codex']);
const WORKFLOW_HOOK_FILES = Object.freeze(['session-start.cjs']);

function skillsForRuntime(runtime) {
  if (!SUPPORTED_RUNTIMES.includes(runtime)) {
    throw new Error(`unsupported Ultra runtime: ${runtime}`);
  }
  return ['ultra'];
}

function skillPolicy(name) {
  if (name !== 'ultra') throw new Error(`unknown packaged Ultra skill: ${name}`);
  return { userInvocable: true, allowImplicitInvocation: true };
}

module.exports = { SUPPORTED_RUNTIMES, WORKFLOW_HOOK_FILES, skillsForRuntime, skillPolicy };
