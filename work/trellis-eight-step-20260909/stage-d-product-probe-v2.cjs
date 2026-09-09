'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const { HOSTS } = require('../../bin/run.cjs');
const { observePiIdentity } = require('../../skills/ultra-delegate/scripts/pi-native-runtime.cjs');
const { executablePath } = require('../../skills/ultra-delegate/scripts/agent-execution-driver.cjs');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const save = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof v === 'string' ? v : JSON.stringify(v, null, 2) + '\n'); };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const repo = path.resolve(__dirname, '../..');
const identity = observePiIdentity(executablePath('pi'));
const sourceFiles = ['run-slice.cjs', 'pi-primary.cjs', 'delegate.cjs', 'host-profile.cjs', 'slice-workspace.cjs', 'slice-channel.cjs'];
const canonical = true;
const shape = process.env.UBP_EXPERIMENT_SHAPE || 'expense';
const repeat = Number(process.env.UBP_EXPERIMENT_REPEAT || '1');
const profile = shape === 'expense' ? 'pi-foundation-v1' : 'pi-balanced-v1';
const wallMs = canonical ? 2100000 : 1200000;
const baselineTime = new Date().toISOString();

async function run(mode) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `ubp-d2-${shape}-r${repeat}-${mode}-`)));
  fs.cpSync(path.join(__dirname, shape === 'expense' ? 'product-fixture' : 'product-manifest-fixture'), root, { recursive: true });
  fs.cpSync(path.join(__dirname, shape === 'expense' ? 'product-canonical-fixture' : 'product-manifest-canonical-fixture'), root, { recursive: true });
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.email', 'probe@example.invalid'); git(root, 'config', 'user.name', 'Product Experiment');
  save(path.join(root, '.gitignore'), '.ultra/.runtime/\nprobe/\n');
  git(root, 'add', '.');
  if (canonical) execFileSync('git', ['commit', '-m', 'test: identical canonical expense ledger baseline'], { cwd: root,
    env: { ...process.env, GIT_AUTHOR_DATE: baselineTime, GIT_COMMITTER_DATE: baselineTime }, stdio: 'pipe' });
  else git(root, 'commit', '-m', 'test: identical expense ledger baseline');
  const baseline = git(root, 'rev-parse', 'HEAD');
  const initialCheck = spawnSync(process.execPath, ['acceptance.cjs'], { cwd: root, encoding: 'utf8' });
  save(path.join(root, 'probe/baseline.json'), { status: initialCheck.status, stdout: initialCheck.stdout, stderr: initialCheck.stderr });
  save(path.join(root, 'probe/coordinator.cjs'), fs.readFileSync(__filename, 'utf8'));
  const digests = Object.fromEntries(sourceFiles.map(n => { const b = fs.readFileSync(path.join(repo, 'skills/ultra-delegate/scripts', n)); save(path.join(root, 'probe/source', n), b.toString()); return [n, sha(b)]; }));
  save(path.join(root, 'probe/finite-run-slice.md'), fs.readFileSync(path.join(repo, 'skills/ultra-delegate/references/finite-run-slice.md'), 'utf8'));
  save(path.join(root, 'probe/receipt-contract.md'), fs.readFileSync(path.join(repo, 'skills/ultra-plan/references/task-evidence-v2.md'), 'utf8'));
  save(path.join(root, `probe/operational-factory.md`), fs.readFileSync(path.join(repo, 'skills/ultra-delegate/references/operational-factory.md'), 'utf8'));
  save(path.join(root, `.ultra/profiles/${profile}.json`), fs.readFileSync(path.join(repo, `skills/ultra-delegate/references/profiles/${profile}.json`), 'utf8'));
  if (!canonical) {
  save(path.join(root, '.ultra/changes/active/expense-ledger/intent.md'), fs.readFileSync(path.join(root, 'GOAL.md'), 'utf8'));
  save(path.join(root, '.ultra/decisions/experiment.md'), 'Current owner authorizes this isolated real product experiment, including native Pi qualified experimental delegation, fresh read-only QA, local sample implementation, integration, testing and local commits. No external effects beyond configured provider calls. Native Primary is sole canonical writer; workers own only explicitly assigned worktree paths. Current prompt activates bounded work; files alone do not. Stop after 20 minutes, at most 2 repair iterations, and 5 finite slices. No Ultra source/test changes.');
  save(path.join(root, '.ultra/contexts/task-expense-ledger.md'), 'Implement and verify GOAL.md. Preserve its intent and read-only acceptance.cjs. Expose actual failure, repair, integration, QA and remaining limits in DELIVERY.json.');
  }
  const args = HOSTS.pi.argv({ pluginRoot: repo, prompt: '', hostArgs: ['--mode', 'rpc', '--offline', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-context-files', '--session-dir', path.join(root, 'probe/sessions'), '--model', 'gpt-5.6-sol'] });
  args.splice(-2);
  const child = spawn(identity.node_path, [identity.runtime_path, ...args], { cwd: root, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const started = Date.now(), events = [], decoder = new StringDecoder('utf8');
  let buffer = '', closed = false;
  const pending = new Map();
  let settle;
  const completion = new Promise(resolve => { settle = resolve; });
  child.stdout.on('data', chunk => {
    buffer += decoder.write(chunk);
    for (;;) {
      const i = buffer.indexOf('\n'); if (i < 0) break;
      const line = buffer.slice(0, i); buffer = buffer.slice(i + 1); if (!line.trim()) continue;
      let event; try { event = JSON.parse(line); } catch { event = { type: 'protocol_error', line }; }
      events.push(event); fs.appendFileSync(path.join(root, 'probe/events.jsonl'), JSON.stringify({ at: Date.now(), event }) + '\n');
      if (event.type === 'response') pending.get(event.id)?.(event);
      if (event.type === 'agent_settled') settle('agent_settled');
    }
  });
  child.stderr.on('data', chunk => fs.appendFileSync(path.join(root, 'probe/stderr.log'), chunk));
  child.on('close', (code, signal) => { closed = true; save(path.join(root, 'probe/exit.json'), { code, signal }); settle('native_exit'); for (const fn of pending.values()) fn({ success: false, error: 'session_unavailable' }); });
  const request = (type, fields = {}) => new Promise(resolve => {
    const id = crypto.randomUUID(); const timer = setTimeout(() => { pending.delete(id); resolve({ success: false, error: 'rpc_timeout' }); }, 15000);
    pending.set(id, v => { clearTimeout(timer); pending.delete(id); resolve(v); }); child.stdin.write(JSON.stringify({ id, type, ...fields }) + '\n');
  });
  const watchdog = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, wallMs);
  const location = { campaign: 2, mode, shape, repeat, profile, canonical, root, pid: child.pid, started, baseline, digests };
  fs.appendFileSync(path.join(__dirname, 'stage-d-product-v2-attempts.jsonl'), JSON.stringify(location) + '\n');
  console.log(JSON.stringify(location));
  try {
    const state = await request('get_state'); if (!state.success) throw new Error(JSON.stringify(state));
    save(path.join(root, 'probe/initial-state.json'), state);
    const common = fs.readFileSync(path.join(__dirname, 'stage-d-product-v2-common.md'), 'utf8');
    const treatment = fs.readFileSync(path.join(__dirname, `stage-d-product-v2-${mode}.md`), 'utf8');
    const prompt = (common + '\n' + treatment).replaceAll('NATIVE_SESSION_ID', state.data.sessionId)
      .replaceAll('PROFILE_ID', profile).replaceAll('TASK_ID', shape === 'expense' ? 'expense-ledger' : 'tree-manifest');
    save(path.join(root, 'probe/prompt.md'), prompt);
    const ack = await request('prompt', { message: prompt }); if (!ack.success) throw new Error(JSON.stringify(ack));
    const end = await completion;
    const finished = Date.now();
    const history = closed ? null : await request('get_messages'); save(path.join(root, 'probe/native-history.json'), history);
    const check = spawnSync(process.execPath, ['acceptance.cjs'], { cwd: root, encoding: 'utf8', timeout: 60000 });
    save(path.join(root, 'probe/final-check.json'), { status: check.status, stdout: check.stdout, stderr: check.stderr });
    const result = { ...location, finished, wall_seconds: (finished - started) / 1000, end, session_id: state.data.sessionId, final_revision: git(root, 'rev-parse', 'HEAD'), acceptance_status: check.status, immutable_acceptance: fs.readFileSync(path.join(root, 'acceptance.cjs')).equals(fs.readFileSync(path.join(__dirname, shape === 'expense' ? 'product-fixture/acceptance.cjs' : 'product-manifest-fixture/acceptance.cjs'))), source_unchanged: sourceFiles.every(n => sha(fs.readFileSync(path.join(repo, 'skills/ultra-delegate/scripts', n))) === digests[n]), delivery: fs.existsSync(path.join(root, 'DELIVERY.json')) ? fs.readFileSync(path.join(root, 'DELIVERY.json'), 'utf8') : null };
    save(path.join(root, 'probe/observation.json'), result); console.log(JSON.stringify(result));
  } finally {
    clearTimeout(watchdog);
    if (!closed) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} await new Promise(resolve => child.once('close', resolve)); }
  }
}
const modes = process.argv.slice(2).filter(arg => arg !== '--canonical'); if (!modes.length || modes.some(m => !['factory', 'solo', 'step1'].includes(m))) throw new Error('pass factory, solo and/or step1');
Promise.allSettled(modes.map(run)).then(results => { for (const r of results) if (r.status === 'rejected') { console.error(r.reason); process.exitCode = 1; } });
