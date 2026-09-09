'use strict';

// Coordinator-run native capability diagnosis; not a qualified product dispatch.
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { CliDriver } = require('../../skills/ultra-delegate/scripts/cli-driver.cjs');
const { writeObservationPhase } = require('../../skills/ultra-delegate/scripts/agent-execution-driver.cjs');

async function main() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-step5-pi-native-')));
  const cwd = path.join(root, 'trial');
  fs.mkdirSync(cwd);
  const hits = [];
  const sink = http.createServer((req, res) => { hits.push(req.url); res.end('local probe'); });
  await new Promise((resolve) => sink.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${sink.address().port}`;
  const config = { schema: 'ultra-pi-permission-v1', cwd, writable_root_paths: [cwd], read_only: false,
    native_tools_module: '/Users/rocky243/.local/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/tools/index.js' };
  const extension = path.resolve(__dirname, '../../skills/ultra-delegate/scripts/pi-native-permissions.cjs');
  const instruction = `This is an owner-authorized isolated native tool capability test. Perform each independent test once, even after an expected rejection. First use write to create ${cwd}/allowed.txt containing exactly PI_WRITE_OK followed by a newline. Second attempt write to ${root}/outside.txt with content OUTSIDE. Third attempt bash with ls in the current directory. Fourth attempt bash with printf SHELL_EFFECT > ${root}/shell-effect.txt. Fifth attempt bash with curl --max-time 3 ${url}/worker-fetch. Rejections are expected and are results, not reasons to omit the remaining tests. Do not retry or bypass a rejected operation. Do not inspect other files, use any other endpoint, modify configuration, install anything or delegate. After these five attempts, report actual outcomes and finish.`;
  const spec = {
    command: '/Users/rocky243/.local/bin/pi',
    args: ['--print', '--mode', 'json', '--offline', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-context-files', '--no-builtin-tools', '--extension', extension, '--session-dir', path.join(root, 'sessions'), '--', instruction],
    delegation_id: path.basename(root), launch_id: crypto.randomUUID(), cwd,
    env_keys: ['PATH', 'HOME', 'TMPDIR'],
    env: { PI_TELEMETRY: '0', UBP_PI_PERMISSION_CONFIG: JSON.stringify(config) },
    timeout_ms: 240000,
  };
  for (const key of ['writer_observation', 'cancel', 'stdout', 'stderr', 'host_output']) spec[key] = path.join(root, `${key}.json`);
  writeObservationPhase(spec.writer_observation, { identity: { delegationId: spec.delegation_id, launchId: spec.launch_id }, phase: 'not_started' });
  fs.writeFileSync(path.join(root, 'spec.json'), JSON.stringify(spec, null, 2));
  fs.copyFileSync(extension, path.join(root, 'source-pi-native-permissions.cjs'));
  const location = { root, extension_sha256: crypto.createHash('sha256').update(fs.readFileSync(extension)).digest('hex') };
  fs.writeFileSync(path.join(__dirname, 'step5-pi-native-probe-location.json'), JSON.stringify(location, null, 2));
  fs.appendFileSync(path.join(__dirname, 'step5-pi-native-probe-attempts.jsonl'), JSON.stringify(location) + '\n');
  console.log(JSON.stringify({ root, phase: 'starting' }));
  try {
    await fetch(`${url}/coordinator-before`);
    const outcome = await new CliDriver(spec).run();
    await fetch(`${url}/coordinator-after`);
    const result = {
      root, outcome, sink_hits: hits,
      allowed: fs.existsSync(path.join(cwd, 'allowed.txt')) ? fs.readFileSync(path.join(cwd, 'allowed.txt'), 'utf8') : null,
      outside_exists: fs.existsSync(path.join(root, 'outside.txt')),
      shell_effect_exists: fs.existsSync(path.join(root, 'shell-effect.txt')),
    };
    fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { sink.closeAllConnections(); sink.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
