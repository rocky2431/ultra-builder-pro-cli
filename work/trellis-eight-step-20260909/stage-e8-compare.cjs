'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const delegate = require('../../skills/ultra-delegate/scripts/delegate.cjs');
const { hostProfile } = require('../../skills/ultra-delegate/scripts/host-profile.cjs');
const { signalOutcome } = require('../../skills/ultra-delegate/scripts/agent-execution-driver.cjs');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const save = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n', { flag: 'wx' });
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, GIT_AUTHOR_DATE: '2026-09-09T00:00:00Z', GIT_COMMITTER_DATE: '2026-09-09T00:00:00Z' } }).trim();
const arms = ['current', 'candidate', 'simpler'];
function promptFor(arm, prompt, options) {
  if (arm === 'current') return prompt;
  if (arm === 'candidate') return options.schemaJson ? `${prompt}\nCanonical terminal result JSON schema:\n${options.schemaJson}` : prompt;
  if (arm === 'simpler') return `${prompt}\nchanged_files, evidence, questions and residual_risks are arrays of strings; checks is an array of objects.`;
  throw new Error('unknown_arm');
}
function score(item, result, unchanged) {
  const text = [result.summary, ...(Array.isArray(result.evidence) ? result.evidence : [])].filter(v => typeof v === 'string').join('\n');
  const contains = fact => new RegExp(`(?<![A-Za-z0-9_])${fact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_-]|\\.[0-9])`, 'u').test(text);
  const missing = item.required_facts.filter(f => !contains(f));
  const forbidden = item.forbidden_facts.filter(contains);
  const valid = result.$schema === 'ultra-delegation-result-v1' && result.status === item.expected_status
    && result.writer_observation?.state === 'stopped' && unchanged;
  return { valid, missing, forbidden, passed: valid && !missing.length && !forbidden.length };
}
function selfCheck() {
  const item = { expected_status: 'finished', required_facts: ['total=17'], forbidden_facts: ['total=0'] };
  const good = { $schema: 'ultra-delegation-result-v1', status: 'finished', summary: 'total=17', evidence: [], writer_observation: { state: 'stopped' } };
  assert.equal(score(item, good, true).passed, true);
  for (const bad of [{ ...good, summary: 'total=0' }, { ...good, summary: 'total=170' }, { ...good, summary: 'total=17.5' }, { ...good, status: 'failed' }, { ...good, writer_observation: { state: 'unknown' } }]) assert.equal(score(item, bad, true).passed, false);
  assert.equal(score(item, { ...good, summary: 'total=17.' }, true).passed, true);
  assert.equal(score(item, good, false).passed, false);
  assert.equal(promptFor('current', 'p', {}), 'p');
  assert.equal(promptFor('candidate', 'p', { schemaJson: '{"type":"object"}' }), 'p\nCanonical terminal result JSON schema:\n{"type":"object"}');
  assert.equal(promptFor('candidate', 'p', {}), 'p');
  console.log('One bounded evaluator self-check passed; factual failure, unknown writer and source mutation are rejected.');
}
async function trial(item, arm, repetition, sourceHashes) {
  const repo = path.resolve(__dirname, '../..');
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `ubp-e8-${item.id}-${repetition}-${arm}-`)));
  fs.mkdirSync(path.join(root, 'probe'));
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.email', 'probe@example.invalid'); git(root, 'config', 'user.name', 'Offline Evaluation');
  save(path.join(root, 'case.json'), item.data); fs.writeFileSync(path.join(root, '.gitignore'), '.ultra/.runtime/\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'test: immutable independent QA input');
  const worktree = path.join(root, '.ultra/.runtime/worktrees/reviewer'); fs.mkdirSync(path.dirname(worktree), { recursive: true });
  git(root, 'worktree', 'add', '--detach', worktree, 'HEAD');
  const dir = path.join(root, '.ultra/.runtime/delegations/reviewer'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'instruction.md'), item.mission + '\n');
  save(path.join(dir, 'permission.json'), { $schema: 'ultra-delegation-permission-v1', writable_roots: [], external_effects: [] });
  const location = { root, worktree, dir, case_id: item.id, partition: item.partition, arm, repetition,
    baseline: git(root, 'rev-parse', 'HEAD'), started_at: new Date().toISOString(), source_hashes: sourceHashes, model: 'gpt-5.6-sol' };
  fs.appendFileSync(path.join(__dirname, 'stage-e8-attempts.jsonl'), JSON.stringify(location) + '\n');
  save(path.join(root, 'location.json'), location);
  const base = hostProfile('pi');
  const profile = { ...base, delegateArgv(prompt, cwd, options) {
    const original = base.delegateArgv(prompt, cwd, options);
    const argv = base.delegateArgv(promptFor(arm, prompt, options), cwd, options);
    assert.deepEqual(argv.slice(0, -1), original.slice(0, -1)); // Only the final native prompt differs.
    save(path.join(root, 'prompt-observation.json'), { original_prompt: prompt, actual_prompt: argv.at(-1), schema_json: options.schemaJson });
    return argv;
  } };
  const started = Date.now();
  let error = null, result;
  try {
    const receipt = delegate.run(['--to', 'pi', '--model', location.model, '--ack-experimental', '--instruction', path.join(dir, 'instruction.md'),
      '--permission', path.join(dir, 'permission.json'), '--worktree', worktree, '--timeout', '90'], { projectRoot: root, resolveHostProfile: () => profile });
    save(path.join(root, 'launch.json'), receipt);
    const deadline = started + 105000;
    while (!fs.existsSync(path.join(dir, 'result.json')) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 250));
    if (!fs.existsSync(path.join(dir, 'result.json'))) delegate.cancel(['--delegation', dir], { projectRoot: root });
    result = delegate.status(['--delegation', dir], { projectRoot: root });
    const worker = JSON.parse(fs.readFileSync(path.join(dir, 'receipt.json'))).worker_pid;
    for (let i = 0; i < 20 && signalOutcome(worker) === 'alive'; i++) await new Promise(resolve => setTimeout(resolve, 100));
    if (signalOutcome(worker) !== 'dead') throw new Error('outer_worker_unresolved');
  } catch (e) { error = e.message; result ||= {}; }
  const unchanged = git(worktree, 'status', '--porcelain') === '';
  const sourceUnchanged = Object.entries(sourceHashes).every(([name, hash]) => sha(fs.readFileSync(path.join(repo, 'skills/ultra-delegate/scripts', name))) === hash);
  const stdout = path.join(dir, 'stdout.log');
  const events = fs.existsSync(stdout) ? fs.readFileSync(stdout, 'utf8').split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }) : [];
  const caseReads = events.filter(e => e.type === 'tool_execution_start' && e.toolName === 'read'
    && typeof e.args?.path === 'string' && path.resolve(worktree, e.args.path) === path.join(worktree, 'case.json'));
  const nativeReadCase = caseReads.some(start => events.some(end => end.type === 'tool_execution_end' && end.toolCallId === start.toolCallId && end.isError === false));
  const metrics = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'stage-c-product-metrics.cjs'), root], { encoding: 'utf8' }));
  const observation = { ...location, wall_seconds: (Date.now() - started) / 1000, error, result, unchanged, source_unchanged: sourceUnchanged,
    native_read_case: nativeReadCase, metrics, permission_decisions: events.filter(e => e.type === 'ultra_pi_permission' && e.phase === 'decision'),
    score: score(item, result, unchanged && !error && sourceUnchanged && nativeReadCase), human_interventions: 0 };
  save(path.join(root, 'observation.json'), observation);
  console.log(JSON.stringify({ case_id: item.id, arm, repetition, wall_seconds: observation.wall_seconds, error, score: observation.score, root }));
  if (error || (result.writer_observation?.state !== 'stopped' && result.status !== 'blocked')) throw new Error('Unresolved lifecycle; retain this attempt and stop the campaign.');
}
async function main() {
  const file = path.join(__dirname, 'stage-e8-independent-cases-v2.json');
  const raw = fs.readFileSync(file);
  assert.equal(sha(raw), 'ca18726dcb877923ee73b1df3fa88fd80956a1491354c9a64eb6377691f16105');
  assert.equal(fs.existsSync(path.join(__dirname, 'stage-e8-attempts.jsonl')), false, 'Existing campaign requires observation, never automatic resubmit.');
  const items = JSON.parse(raw).cases; assert.equal(items.length, 4);
  const sourceDir = path.resolve(__dirname, '../../skills/ultra-delegate/scripts');
  const names = ['host-profile.cjs', 'delegate.cjs', 'delegate-worker.cjs', 'pi-native-permissions.cjs', 'pi-native-runtime.cjs', 'agent-execution-driver.cjs', 'cli-driver.cjs'];
  const sourceHashes = Object.fromEntries(names.map(n => [n, sha(fs.readFileSync(path.join(sourceDir, n)))]));
  save(path.join(__dirname, 'stage-e8-campaign.json'), { schema: 'ubp-offline-comparison-v1', cases_sha256: sha(raw), runner_sha256: sha(fs.readFileSync(__filename)), source_hashes: sourceHashes,
    arms, repetitions: 2, attempts: 24, model: 'gpt-5.6-sol', attempt_timeout_seconds: 90, current_policy_unchanged: true });
  for (const partition of ['development', 'held-out']) {
    for (const [index, item] of items.filter(x => x.partition === partition).entries()) {
      for (const repetition of [1, 2]) {
        const order = arms.map((_, i) => arms[(i + index + repetition - 1) % arms.length]);
        // Sequential arms avoid model-provider contention from this comparison.
        for (const arm of order) await trial(item, arm, repetition, sourceHashes);
      }
    }
  }
}
if (require.main === module) {
  if (process.argv[2] === '--self-check') selfCheck();
  else if (process.argv[2] === '--run') main().catch(e => { console.error(e.message); process.exitCode = 1; });
  else { console.error('Use --self-check or --run; no default provider calls.'); process.exitCode = 1; }
}
