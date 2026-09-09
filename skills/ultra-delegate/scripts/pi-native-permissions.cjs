'use strict';

const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { permissionDecision } = require('./acp-driver.cjs');

const CONFIG_ENV = 'UBP_PI_PERMISSION_CONFIG';
const OPTIONS = Object.freeze([
  { optionId: 'allow-once', kind: 'allow_once' },
  { optionId: 'reject-once', kind: 'reject_once' },
]);

function permissionForTool(spec, event) {
  const name = event.toolName;
  const kind = ['read', 'grep', 'find', 'ls'].includes(name) ? 'read'
    : ['write', 'edit'].includes(name) ? 'edit'
      : ['bash', 'powershell'].includes(name) ? 'execute' : 'other';
  const locations = [];
  if (kind === 'edit') {
    let target = event.input?.path;
    if (typeof target !== 'string' || !target || target.includes('\0')) {
      throw new Error('Pi write/edit requires a nonempty file path without NUL');
    }
    // Match Pi's path spelling, then pass the checked absolute path to the
    // native tool. The permission check and actual write consume one path.
    target = target.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/gu, ' ').replace(/^@/u, '');
    if (target === '~' || target.startsWith('~/')) target = path.join(os.homedir(), target.slice(2));
    if (target.startsWith('file://')) target = fileURLToPath(target);
    event.input.path = path.resolve(spec.cwd, target);
    locations.push({ path: event.input.path });
  }
  return permissionDecision(spec, { toolCall: { kind, locations }, options: OPTIONS });
}

function emit(event) {
  process.stdout.write(`${JSON.stringify({ type: 'ultra_pi_permission', ...event })}\n`);
}

async function piPermissions(pi) {
  const encoded = process.env[CONFIG_ENV];
  const spec = JSON.parse(encoded || 'null');
  if (!spec || spec.schema !== 'ultra-pi-permission-v1'
      || typeof spec.cwd !== 'string' || !path.isAbsolute(spec.cwd)
      || typeof spec.read_only !== 'boolean'
      || typeof spec.native_tools_module !== 'string' || !path.isAbsolute(spec.native_tools_module)
      || !Array.isArray(spec.writable_root_paths)
      || !spec.writable_root_paths.every((root) => typeof root === 'string' && path.isAbsolute(root))) {
    throw new Error('Pi requires the launcher-bound Ultra permission configuration');
  }
  const configDigest = crypto.createHash('sha256').update(encoded).digest('hex');
  pi.on('tool_call', (event, context) => {
    if (path.resolve(context.cwd) !== spec.cwd) throw new Error('Ultra Pi execution directory changed');
    const decision = permissionForTool(spec, event);
    emit({
      phase: 'decision', tool_call_id: event.toolCallId, tool_name: event.toolName,
      tool_kind: decision.kind, decision: decision.decision, scope: decision.scope,
      input_digest: crypto.createHash('sha256').update(JSON.stringify(event.input)).digest('hex'),
    });
    if (!decision.allowed) return { block: true, reason: `ultra_permission_denied: ${decision.scope}` };
    return undefined;
  });
  // Use Pi's actual native tool definitions, including their execution code.
  // Built-ins start disabled so a missing/broken policy cannot leave an
  // unrestricted tool set. These same native tools are restored after the
  // blocking handler is registered; no substitute or fake tool is introduced.
  const { createAllToolDefinitions } = await import(pathToFileURL(spec.native_tools_module).href);
  for (const tool of Object.values(createAllToolDefinitions(spec.cwd))) pi.registerTool(tool);
  pi.on('session_start', (_event, context) => {
    if (path.resolve(context.cwd) !== spec.cwd) throw new Error('Ultra Pi execution directory changed');
    const tools = pi.getAllTools().map((tool) => tool.name);
    // Activate every restored native tool, including Bash.
    pi.setActiveTools(tools);
    emit({ phase: 'ready', config_digest: configDigest, tools: pi.getActiveTools(),
      env_keys: Object.keys(process.env).sort() });
  });
}

module.exports = piPermissions;
module.exports.CONFIG_ENV = CONFIG_ENV;
module.exports.permissionForTool = permissionForTool;
