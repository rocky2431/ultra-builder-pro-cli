'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2]);
const sessions = [];
function readSessions(dir, role) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue;
    const file = path.join(dir, name), rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
    const messages = rows.map(r => r.message).filter(m => m?.role === 'assistant' && m.usage);
    const sum = key => messages.reduce((n, m) => n + (m.usage[key] || 0), 0);
    sessions.push({ role, path: path.relative(root, file), session_id: rows[0].id,
      models: [...new Set(messages.map(m => m.model))], model_calls: messages.length,
      input_tokens: sum('input'), output_tokens: sum('output'), cached_read_tokens: sum('cacheRead'),
      cached_write_tokens: sum('cacheWrite'), reasoning_tokens: sum('reasoning'), total_tokens: sum('totalTokens'),
      native_estimated_cost: messages.reduce((n, m) => n + (m.usage.cost?.total || 0), 0) });
  }
}
readSessions(path.join(root, 'probe/sessions'), 'primary');
for (const entry of fs.readdirSync(path.join(root, 'probe'), { withFileTypes: true })) {
  if (entry.isDirectory()) readSessions(path.join(root, 'probe', entry.name, 'pi-sessions'), `${entry.name}-qa`);
}
const delegates = path.join(root, '.ultra/.runtime/delegations');
if (fs.existsSync(delegates)) for (const name of fs.readdirSync(delegates)) readSessions(path.join(delegates, name, 'pi-sessions'), name);
const totals = {};
for (const key of ['model_calls', 'input_tokens', 'output_tokens', 'cached_read_tokens', 'cached_write_tokens', 'reasoning_tokens', 'total_tokens', 'native_estimated_cost']) totals[key] = sessions.reduce((n, s) => n + s[key], 0);
const results = fs.existsSync(delegates) ? fs.readdirSync(delegates).map(name => path.join(delegates, name, 'result.json')).filter(fs.existsSync).map(p => JSON.parse(fs.readFileSync(p))) : [];
const workers = results.filter(r => r.changed_files.length);
const overlap = workers.length === 2 ? Math.max(0, Math.min(...workers.map(r => Date.parse(r.finished_at))) - Math.max(...workers.map(r => Date.parse(r.started_at)))) / 1000 : null;
console.log(JSON.stringify({ root, sessions, totals, worker_overlap_seconds: overlap,
  cost_note: 'Native Pi usage and native configured price estimates; not a billing receipt. Total tokens include cache traffic; reasoning is a subset of output and is not added again.' }, null, 2));
