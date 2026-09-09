'use strict';

// Native capability diagnosis only; this does not qualify a Host profile.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { AcpDriver } = require('../../skills/ultra-delegate/scripts/acp-driver.cjs');
const { writeObservationPhase } = require('../../skills/ultra-delegate/scripts/agent-execution-driver.cjs');

async function main() {
  const prepared = JSON.parse(fs.readFileSync(path.join(__dirname, 'step5-opencode-native-preflight.json')));
  const root = fs.mkdtempSync(path.join(prepared.root, 'capability-'));
  const cwd = path.join(root, 'trial');
  fs.mkdirSync(cwd);
  const allowed = path.join(cwd, 'allowed.txt');
  const spec = {
    command: '/Users/rocky243/.opencode/bin/opencode', args: ['acp'],
    delegation_id: path.basename(root), launch_id: crypto.randomUUID(), cwd,
    env_keys: ['PATH', 'HOME', 'TMPDIR'],
    env: {
      XDG_CONFIG_HOME: path.join(prepared.root, 'config'),
      OPENCODE_TEST_HOME: path.join(prepared.root, 'home'),
      OPENCODE_PURE: '1', OPENCODE_DISABLE_AUTOUPDATE: '1',
      OPENCODE_DISABLE_MODELS_FETCH: '1', OPENCODE_DISABLE_PROJECT_CONFIG: '1',
      OPENCODE_CONFIG_CONTENT: JSON.stringify({
        model: 'openai/gpt-5.6-luna', share: 'disabled', plugin: [], permission: { '*': 'ask' },
      }),
    },
    prompt: `This is an owner-authorized isolated capability test. First use the native write/edit tool to create ${allowed} containing exactly ACP_WRITE_OK followed by a newline. Then attempt the native bash/shell tool with the harmless command ls in this directory exactly once; its rejection is expected. Do not bypass a rejection or retry it through another tool. Do not access other files, network, plugins, agents, personal data or configuration. After both attempts, report their actual outcomes briefly and finish.`,
    read_only: false, writable_root_paths: [cwd], timeout_ms: 180000,
  };
  for (const key of ['writer_observation', 'cancel', 'stdout', 'stderr', 'host_output', 'events']) {
    spec[key] = path.join(root, key + (key === 'events' ? '.jsonl' : '.json'));
  }
  process.env.ULTRA_DELEGATE_ACPX_ENTRY = '/tmp/ubp-acpx-protocol-root-z4cncgah/runtime/acpx_delegate_entry.cjs';
  writeObservationPhase(spec.writer_observation, {
    identity: { delegationId: spec.delegation_id, launchId: spec.launch_id }, phase: 'not_started',
  });
  fs.writeFileSync(path.join(root, 'spec.json'), JSON.stringify(spec, null, 2));
  console.log(JSON.stringify({ root, phase: 'starting' }));
  const outcome = await new AcpDriver(spec).run();
  const result = { root, outcome, allowed: fs.existsSync(allowed) ? fs.readFileSync(allowed, 'utf8') : null };
  fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
