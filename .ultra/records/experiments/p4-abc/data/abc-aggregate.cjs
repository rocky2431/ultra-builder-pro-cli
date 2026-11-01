// usage: node /tmp/abc-aggregate.cjs  — prints the per-unit table and the decision-rule inputs as JSON + Markdown
const fs = require('fs');
const tsv = (f) => { const [h, ...rows] = fs.readFileSync(`/tmp/abc/${f}.tsv`, 'utf8').trim().split('\n').map((l) => l.split('\t')); return rows.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const usage = tsv('usage'), units = tsv('units');
const out = [];
for (const T of ['T1', 'T2', 'T3']) for (const A of ['A', 'B', 'C']) {
  const u = `${T}-${A}`; const rows = usage.filter((r) => r.unit === u);
  const num = (r) => (/^\d+$/.test(r.tokens) ? +r.tokens : 0);
  const role = (n) => rows.filter((r) => r.role === n);
  const ms = (n) => role(n).reduce((s, r) => s + (+r.duration_ms || 0), 0);
  const writer = role('writer').reduce((s, r) => s + num(r), 0);
  const others = rows.filter((r) => r.role !== 'writer').reduce((s, r) => s + num(r), 0);
  const wall = A === 'A' ? ms('writer') : ms('explore') + ms('writer') + Math.max(ms('tester'), ms('codex-review')) + ms('rework');
  let hidden = null; const log = `/tmp/abc/${u}.hidden.log`;
  if (fs.existsSync(log)) { const t = fs.readFileSync(log, 'utf8'); const g = (k) => +((t.match(new RegExp(`^ℹ ${k} (\\d+)$`, 'm')) || [])[1] ?? NaN); hidden = { tests: g('tests'), pass: g('pass'), fail: g('fail') }; }
  const unit = units.find((r) => r.unit === u) || {};
  out.push({ unit: u, task: T, arm: A, writer_tokens: writer, other_tokens: others, total_tokens: writer + others,
    codex_unknown: rows.some((r) => r.role === 'codex-review'), wall_ms: wall, rework: unit.rework, first_pass: unit.first_pass_visible,
    interventions: unit.interventions, hidden, notes: unit.notes });
}
console.log(JSON.stringify(out, null, 1));
