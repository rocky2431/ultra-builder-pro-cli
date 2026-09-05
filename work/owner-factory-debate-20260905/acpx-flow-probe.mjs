// Research probe only: deterministic nodes, no agent, shell, network, or product edits.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { FlowRunner, defineFlow, compute, checkpoint } from '/Users/rocky243/.local/share/agent-delegation/runtime/node_modules/acpx/dist/flows.js';

const runner = new FlowRunner({
  resolveAgent: () => ({ agentName: 'unused', agentCommand: '/usr/bin/false', cwd: process.cwd() }),
  permissionMode: 'deny-all',
  outputRoot: fileURLToPath(new URL('./flow-probe-artifacts/', import.meta.url)),
});
const step = compute({ run: ({ outputs }) => {
  const n = (outputs.step?.n ?? 0) + 1;
  return { n, next: n < 3 ? 'again' : 'pause' };
} });
const flow = defineFlow({
  name: 'research-compute-loop', startAt: 'step',
  nodes: { step, pause: checkpoint({ summary: 'Research probe paused' }) },
  edges: [{ from: 'step', switch: { on: '$.next', cases: { again: 'step', pause: 'pause' } } }],
});
const result = await runner.run(flow, {});
assert.equal(result.state.status, 'waiting');
assert.equal(result.state.outputs.step.n, 3);
assert.equal(result.state.steps.length, 4);
assert.deepEqual(result.state.sessionBindings, {});

const duplicate = { ...flow, name: 'research-fanout-rejection', edges: [
  { from: 'step', to: 'pause' }, { from: 'step', to: 'step' },
] };
await assert.rejects(() => runner.run(duplicate, {}), /multiple outgoing edges/);
console.log(JSON.stringify({
  kind: 'compute-only research probe', acpx_version: '0.13.2',
  loop_iterations: result.state.outputs.step.n, steps: result.state.steps.length,
  checkpoint_status: result.state.status, agent_sessions: 0,
  multiple_outgoing_edges: 'rejected', run_dir: result.runDir,
  limits: 'Does not qualify agent execution, parallel workers, resume, permissions, cancellation, or a software factory.',
}, null, 2));
