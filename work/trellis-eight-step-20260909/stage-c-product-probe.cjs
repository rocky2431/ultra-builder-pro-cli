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
const sourceFiles = ['run-slice.cjs', 'pi-primary.cjs', 'delegate.cjs', 'host-profile.cjs'];
const canonical = process.argv.includes('--canonical');
const wallMs = canonical ? 2100000 : 1200000;
const baselineTime = new Date().toISOString();

async function run(mode) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `ubp-product-${canonical ? 'canonical-' : ''}${mode}-`)));
  fs.cpSync(path.join(__dirname, 'product-fixture'), root, { recursive: true });
  if (canonical) fs.cpSync(path.join(__dirname, 'product-canonical-fixture'), root, { recursive: true });
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
  save(path.join(root, '.ultra/profiles/pi-foundation-v1.json'), fs.readFileSync(path.join(repo, 'skills/ultra-delegate/references/profiles/pi-foundation-v1.json'), 'utf8'));
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
  const location = { mode, canonical, root, pid: child.pid, started, baseline, digests };
  fs.appendFileSync(path.join(__dirname, `stage-c-product-${canonical ? 'canonical-' : ''}attempts.jsonl`), JSON.stringify(location) + '\n');
  console.log(JSON.stringify(location));
  try {
    const state = await request('get_state'); if (!state.success) throw new Error(JSON.stringify(state));
    save(path.join(root, 'probe/initial-state.json'), state);
    const common = `You are the native Primary in an owner-authorized isolated product experiment. Your exact session id is ${state.data.sessionId}. Read GOAL.md, src/money.cjs and acceptance.cjs. Deliver the requested working CLI, README and a local integrated commit. You may use native read/write/edit/bash. Never edit acceptance.cjs, GOAL.md or the baseline evidence; never change Ultra itself, qualification, installed tools, HOME or credentials. Use no dependencies or network. Existing provider use via qualified Pi is authorized only for the Factory experiment. The seeded baseline failure is already captured in probe/baseline.json; inspect and reproduce it, then retain actual before/after results. Implementation/repair is bounded by 20 minutes and at most two repair iterations; prioritize the working product. Write DELIVERY.json with status (delivery_ready only after current E2E passes), goal coverage, exact final implementation Git revision, test evidence paths, failures and repair provenance, review evidence, residual risks. Track honest outcomes, not fabricated success. Do all authorized work in this turn; use W1 wait for any slices so completion does not require an external continuation. Do not write a plan and stop.\n`;
    const factory = `Factory treatment: you choose and document a useful two-worker disjoint decomposition and explicit shared interface in interface.md before implementation. Read probe/finite-run-slice.md and the available .ultra/profiles/pi-foundation-v1.json. First use a fresh read-only Challenger through ultra_slice to inspect GOAL.md and your proposed interface/decomposition; commit planning files before creating its clean detached worktree. Consume its actual result and resolve relevant objections. Then create two fresh clean detached worktrees at the same exact planning base and run two scoped-write workers concurrently using a second finite RunSlice via ultra_slice delivery wait. You select the actual file boundaries and must give each worker the exact goal, interface and allowed paths. Do not have workers edit the canonical tree, acceptance, or .ultra. The profile supplies Pi Luna/Terra worker models and exact qualification digest; no substitute host. After attention, read both exact result references and integrate their real changes serially into the canonical tree; you own CLI/persistence integration and seeded defect repair. Run current combined E2E, preserve any real failure, repair within budget, commit the integrated sample, and use a fresh read-only Reviewer at that exact integrated revision through another finite RunSlice. Reviewer may read source and acceptance and inspect test evidence; a denied test effect must be reported honestly rather than bypassed. Consume the review and fix only real blocking findings within the remaining two-repair budget. Re-run E2E at the final implementation revision and produce DELIVERY.json. At most five slices total, max two workers per slice, each attempt timeout at most 360 seconds and slice absolute deadline at most 420 seconds. Build packets yourself using the reference schema: SHA256 exact bytes, actual session id above, canonical intent/grant/task paths already present, experimental_ack true, clean git worktrees under .ultra/.runtime/trees, fresh attempt dirs containing only instruction.md and permission.json. Read-only roles use writable_roots [], worker roles only their selected directories; external_effects []. All task_refs use id expense-ledger. Node stdlib and git can format/check packet data; these must not choose decomposition or semantic next steps for you. Worker response must follow the delegate's typed result schema and list changed paths/checks honestly. Never poll while a W1 tool is waiting.\n`;
    const solo = `Solo treatment: implement and verify the complete task yourself using the same native tools/model and total wall budget. Do not delegate or call ultra_slice. Do your own goal-focused review after current E2E passes and document it explicitly as self-review. Preserve seeded and any natural failures with their exact provenance. Your role covers the same importer, reporter and integration deliverable; do not reduce scope.\n`;
    const prompt = canonical
      ? (fs.readFileSync(path.join(__dirname, 'stage-c-product-canonical-common.md'), 'utf8')
        + '\n' + fs.readFileSync(path.join(__dirname, `stage-c-product-canonical-${mode}.md`), 'utf8')).replaceAll('NATIVE_SESSION_ID', state.data.sessionId)
      : common + (mode === 'factory' ? factory : solo);
    save(path.join(root, 'probe/prompt.md'), prompt);
    const ack = await request('prompt', { message: prompt }); if (!ack.success) throw new Error(JSON.stringify(ack));
    const end = await completion;
    const finished = Date.now();
    const history = closed ? null : await request('get_messages'); save(path.join(root, 'probe/native-history.json'), history);
    const check = spawnSync(process.execPath, ['acceptance.cjs'], { cwd: root, encoding: 'utf8', timeout: 60000 });
    save(path.join(root, 'probe/final-check.json'), { status: check.status, stdout: check.stdout, stderr: check.stderr });
    const result = { ...location, finished, wall_seconds: (finished - started) / 1000, end, session_id: state.data.sessionId, final_revision: git(root, 'rev-parse', 'HEAD'), acceptance_status: check.status, immutable_acceptance: fs.readFileSync(path.join(root, 'acceptance.cjs')).equals(fs.readFileSync(path.join(__dirname, 'product-fixture/acceptance.cjs'))), source_unchanged: sourceFiles.every(n => sha(fs.readFileSync(path.join(repo, 'skills/ultra-delegate/scripts', n))) === digests[n]), delivery: fs.existsSync(path.join(root, 'DELIVERY.json')) ? fs.readFileSync(path.join(root, 'DELIVERY.json'), 'utf8') : null };
    save(path.join(root, 'probe/observation.json'), result); console.log(JSON.stringify(result));
  } finally {
    clearTimeout(watchdog);
    if (!closed) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} await new Promise(resolve => child.once('close', resolve)); }
  }
}
const modes = process.argv.slice(2).filter(arg => arg !== '--canonical'); if (!modes.length || modes.some(m => !['factory', 'solo'].includes(m))) throw new Error('pass factory and/or solo, optionally --canonical');
Promise.allSettled(modes.map(run)).then(results => { for (const r of results) if (r.status === 'rejected') { console.error(r.reason); process.exitCode = 1; } });
