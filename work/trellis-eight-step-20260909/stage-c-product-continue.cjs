'use strict';
// Explicit experiment continuation. This is not an unattended W4 implementation.
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { HOSTS } = require('../../bin/run.cjs');
const { observePiIdentity } = require('../../skills/ultra-delegate/scripts/pi-native-runtime.cjs');
const { executablePath } = require('../../skills/ultra-delegate/scripts/agent-execution-driver.cjs');
const repo = path.resolve(__dirname, '../..');
const root = fs.realpathSync(process.argv[2]), promptFile = path.resolve(process.argv[3]);
const phase = process.argv[4];
if (!/^[a-z0-9-]+$/.test(phase || '')) throw new Error('root, prompt file and phase required');
const dir = path.join(root, 'probe', phase); fs.mkdirSync(dir, { recursive: false });
const initial = JSON.parse(fs.readFileSync(path.join(root, 'probe/initial-state.json')));
const identity = observePiIdentity(executablePath('pi'));
const prompt = fs.readFileSync(promptFile, 'utf8'); fs.writeFileSync(path.join(dir, 'prompt.md'), prompt);
const args = HOSTS.pi.argv({ pluginRoot: repo, prompt, hostArgs: ['--print', '--mode', 'json', '--offline', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-context-files', '--session', initial.data.sessionFile, '--model', 'gpt-5.6-sol'] });
const started = Date.now();
const out = fs.openSync(path.join(dir, 'events.jsonl'), 'w'), err = fs.openSync(path.join(dir, 'stderr.log'), 'w');
const child = spawn(identity.node_path, [identity.runtime_path, ...args], { cwd: root, detached: true, stdio: ['ignore', out, err] });
fs.closeSync(out); fs.closeSync(err);
const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 1200000);
console.log(JSON.stringify({ root, phase, pid: child.pid, started, explicit_resume_session: initial.data.sessionId }));
child.on('close', (code, signal) => {
  clearTimeout(timer);
  const events = fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const assistant = events.filter(e => e.type === 'message_end' && e.message?.role === 'assistant').at(-1)?.message;
  const check = spawnSync(process.execPath, ['acceptance.cjs'], { cwd: root, encoding: 'utf8', timeout: 60000 });
  const result = { root, phase, code, signal, wall_seconds: (Date.now() - started) / 1000, agent_end: events.some(e => e.type === 'agent_end'), stop_reason: assistant?.stopReason,
    final_text: assistant?.content?.filter(c => c.type === 'text').map(c => c.text).join(''), acceptance: { status: check.status, stdout: check.stdout, stderr: check.stderr } };
  fs.writeFileSync(path.join(dir, 'observation.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result)); process.exitCode = code === 0 && result.agent_end && result.stop_reason === 'stop' ? 0 : 1;
});
