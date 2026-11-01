'use strict';

const { problem, readRecord } = require('./formats.cjs');
const { status } = require('./states.cjs');

function rules(id, checks) {
  const ids = checks.map((c) => c.id).join(' ') || '--stale';
  return [
    '- Do not edit .ultra/spec.md, .ultra/checks.json, .ultra/plan.json, .ultra/ledger/ '
      + 'or the files the checks above run. If a check or a requirement looks wrong, '
      + 'stop and escalate.',
    '- Change only files inside the scope, and commit your work: '
      + 'evidence from an uncommitted tree never counts.',
    `- Run \`ubp check ${ids}\` until every check above is green, then \`ubp node done ${id}\`.`,
    '- Escalate instead of deciding: a change of direction (L0) and any deletion or '
      + 'narrowing of a requirement go to the Owner.',
    '- Record every other decision you made without asking as one line in .ultra/rulings.md: '
      + '`- YYYY-MM-DD Lx 裁决：<决定> — 因为 <理由> '
      + '— 如果判断错了，代价是 <代价>`.',
    `- Before \`ubp node done ${id}\`, write .ultra/records/handoffs/${id}.md: `
      + 'the interfaces you created, what dependent nodes must know, and what is left unfinished.',
    '- If three attempts leave a check red, stop and report the check, '
      + 'its error line and what you tried.',
  ].join('\n');
}

function compile(project, node, state, handoffs) {
  const milestone = project.milestones.find((m) => m.id === node.milestone);
  const checks = project.checks.filter((c) => node.kind === 'cleanup' ? Object.hasOwn(c, 'fix')
    : c.covers.some((r) => node.covers.includes(r)));
  return [
    `# Node ${node.id}: ${node.title}`,
    `Milestone ${node.milestone}: ${milestone?.title ?? 'not in .ultra/plan.json'} · node state `
      + state.nodes.find((n) => n.id === node.id).state,
    '## Requirements',
    node.covers.map((r) => project.requirementText.get(r) ?? `${r}: not in .ultra/spec.md`)
      .join('\n\n') || 'None.',
    '## Checks that must turn green (read-only)',
    checks.map((c) => `- ${c.id} · ${state.checks.find((s) => s.id === c.id).state} · `
      + `\`${c.run}\`` + (node.kind === 'cleanup' ? ` · fix: ${c.fix}` : ''))
      .join('\n') || 'None.',
    '## Scope',
    node.scope?.length ? node.scope.map((prefix) => `- ${prefix}`).join('\n')
      : 'Not declared: change only what the requirements need.',
    '## Handoffs from dependencies',
    handoffs.length ? handoffs.map((h) => `### ${h.id}\n\n${h.text}`).join('\n\n') : 'None.',
    '## Rules',
    rules(node.id, checks),
  ].join('\n\n') + '\n';
}

function handoff(root, id) {
  const relative = `.ultra/records/handoffs/${id}.md`;
  const { exists, bytes } = readRecord(root, relative);
  if (!exists) return { text: 'No handoff written.', fromFile: false };
  if (!bytes) {
    return { text: 'Not read: not a regular file inside the project.', fromFile: false };
  }
  const text = bytes.toString('utf8').replace(/\r\n/gu, '\n')
    .replace(/^(?:[^\S\n]*\n)+/u, '').trimEnd();
  return { text: text || 'No handoff written.', fromFile: true };
}

function context(project, id, budget) {
  const node = project.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`Unknown node ${id}. Use an id from plan.json.`);
  const state = status(project);
  const handoffs = node.depends.map((dep) => ({ id: dep,
    ...(project.nodes.some((n) => n.id === dep) ? handoff(project.root, dep)
      : { text: 'Not a node in .ultra/plan.json.', fromFile: false }) }));
  let brief = compile(project, node, state, handoffs);
  let bytes = Buffer.byteLength(brief);
  const omitted = [];
  for (let i = handoffs.length - 1; bytes > budget && i >= 0; i--) {
    const handoff = handoffs[i];
    const replacement = `Omitted to fit the budget: read .ultra/records/handoffs/${handoff.id}.md`;
    if (!handoff.fromFile || Buffer.byteLength(handoff.text) <= Buffer.byteLength(replacement)) {
      continue;
    }
    handoff.text = replacement;
    omitted.push(handoff.id);
    brief = compile(project, node, state, handoffs);
    bytes = Buffer.byteLength(brief);
  }
  const ok = bytes <= budget;
  const problems = ok ? [] : [problem('brief-over-budget',
    `Node ${id} brief is ${bytes} bytes, exceeding the ${budget} byte budget`,
    'Split the node so its requirements, checks and rules fit the budget.')];
  return { ok, node: id, bytes, omitted, brief: ok ? brief : null, problems };
}

module.exports = { context };
