'use strict';

// UBP-side consumer harness for the agent-delegation programming entry
// (`runtime/acpx_delegate_entry.cjs` in the agent-delegate-skill repository).
// This proves the thin public ACPX boundary is consumable from Ultra's
// delegated-execution seam with the existing fixture agent: raw permission
// requests carry the exact options and locations Ultra's permissionDecision
// needs, exact-option selections map without widening, and the typed result
// line stays the single terminal truth. The production delegate driver now
// drives this same entry contract (`acpx-delegate-turn-request/v1`), so this
// harness pins the consumer side of that public boundary (see the Stage B
// handover).
//
// Opt-in: point UBP_TEST_ACPX_ENTRY at the entry script inside a runtime root
// whose node_modules resolves the pinned acpx (for example a temp dir with
// runtime/node_modules symlinked to the installed pinned runtime and the
// entry script copied in, exactly like the agent-delegate-skill tests do).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FAKE_ACP_AGENT = path.join(ROOT, 'tests', 'fixtures', 'fake-acp-agent.cjs');
const ENTRY = process.env.UBP_TEST_ACPX_ENTRY;

function resultPayload() {
  return {
    $schema: 'ultra-delegation-result-v1',
    status: 'finished',
    summary: 'acpx entry turn completed.',
    changed_files: [],
    checks: [],
    evidence: [],
    questions: [],
    residual_risks: [],
  };
}

// Drives one entry turn. `decide` receives each raw permission request and
// returns the optionId Ultra selected — the same exact-option contract the
// installed permissionDecision enforces on the legacy driver. Each turn owns
// an isolated temp dir for its config fixture and cleanup runs on every exit
// path: a disposable file in the repository root races the installer's
// untracked-file provenance scan, which lstats entries it just enumerated.
function runEntryTurn({ scenario, location, decide, env = {} }) {
  return new Promise((resolve, reject) => {
    const config = {
      scenario,
      result: resultPayload(),
      ...(scenario === 'permission-allow' || scenario === 'permission-widening'
        ? { location }
        : {}),
    };
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-acpx-entry-'));
    const configPath = path.join(workdir, `${scenario}-config-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(configPath, `${JSON.stringify(config)}\n`);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      fs.rmSync(workdir, { recursive: true, force: true });
    };
    const child = spawn(process.execPath, [ENTRY], {
      cwd: workdir,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: os.tmpdir(),
        LANG: 'C',
        ...env,
      },
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    const lines = [];
    let buffer = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      cleanup();
      reject(new Error('entry turn timed out'));
    }, 30000);
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      for (;;) {
        const newline = buffer.indexOf('\n');
        if (newline < 0) break;
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        lines.push(message);
        if (message.type === 'permission_request' && decide) {
          const raw = message.request.raw || {};
          const toolCall = raw.toolCall || {};
          const options = Array.isArray(raw.options) ? raw.options : [];
          child.stdin.write(`${JSON.stringify({
            type: 'permission_decision',
            id: message.id,
            optionId: decide({ raw, toolCall, options }),
          })}\n`);
        }
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      cleanup();
      resolve({ code, lines });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      cleanup();
      reject(error);
    });
    child.stdin.write(`${JSON.stringify({
      schema: 'acpx-delegate-turn-request/v1',
      agent_argv: [process.execPath, FAKE_ACP_AGENT, configPath],
      cwd: workdir,
      prompt: `entry harness ${scenario}`,
      timeout_ms: 20000,
    })}\n`);
  });
}

test('ACPX entry is skipped without an explicit runtime selection', () => {
  if (!ENTRY) return;
  assert.equal(typeof ENTRY, 'string');
});

test('ACPX entry completes a normal turn with typed result and raw events', {}, async (t) => {
  if (!ENTRY) return t.skip('UBP_TEST_ACPX_ENTRY not set');
  const { code, lines } = await runEntryTurn({ scenario: 'happy' });
  assert.equal(code, 0);
  const started = lines.find((line) => line.type === 'started');
  assert.equal(started.acpx_version, '0.13.2');
  const result = lines.find((line) => line.type === 'result');
  assert.equal(result.result.status, 'completed');
  assert.equal(result.result.stopReason, 'end_turn');
  const tags = lines.filter((line) => line.type === 'event').map((line) => line.event.tag);
  assert.ok(tags.includes('agent_message_chunk'), 'the turn must stream message chunks');
  assert.ok(tags.includes('tool_call'), 'the turn must surface tool calls');
});

test('ACPX entry permission probes enforce the exact option and location boundary', {}, async (t) => {
  if (!ENTRY) return t.skip('UBP_TEST_ACPX_ENTRY not set');
  const insideRoot = path.join(os.tmpdir(), 'ubp-entry-inside');
  fs.mkdirSync(insideRoot, { recursive: true });
  // Ultra decides from the raw kind/locations/options exactly as the legacy
  // driver's permissionDecision does: an edit inside the granted root gets
  // the exact allow_once option; anything else is rejected through the exact
  // reject_once option. No synthesized option ids, no widening.
  const { code, lines } = await runEntryTurn({
    scenario: 'permission-allow',
    location: insideRoot,
    decide: ({ toolCall, options }) => {
      assert.equal(toolCall.kind, 'edit');
      const target = (toolCall.locations || [])[0]?.path;
      const permitted = target && (target === insideRoot || target.startsWith(`${insideRoot}/`));
      const wanted = permitted ? 'allow_once' : 'reject_once';
      const option = options.find((item) => item.kind === wanted);
      assert.ok(option, `the request must offer the ${wanted} option`);
      return option.optionId;
    },
  });
  assert.equal(code, 0);
  const result = lines.find((line) => line.type === 'result');
  assert.equal(result.result.status, 'completed');
  const request = lines.find((line) => line.type === 'permission_request');
  assert.ok(request, 'the raw permission request must reach the consumer');
  assert.equal(request.request.raw.toolCall.kind, 'edit');
  assert.deepEqual(request.request.raw.toolCall.locations, [{ path: insideRoot }]);
  assert.ok(
    request.request.raw.options.every((option) => typeof option.optionId === 'string'),
    'raw options must keep their exact option ids',
  );
});

test('ACPX entry rejects protocol misuse before any turn starts', {}, async (t) => {
  if (!ENTRY) return t.skip('UBP_TEST_ACPX_ENTRY not set');
  const child = spawn(process.execPath, [ENTRY], {
    cwd: os.tmpdir(),
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  let sawStarted = false;
  child.stdout.on('data', (chunk) => {
    if (chunk.toString('utf8').includes('"type":"started"')) sawStarted = true;
  });
  child.stdin.write(`${JSON.stringify({ schema: 'acpx-delegate-turn-request/v1' })}\n`);
  const code = await new Promise((resolve) => child.on('exit', resolve));
  assert.equal(code, 2);
  assert.equal(sawStarted, false, 'misuse must be rejected before any turn or agent starts');
});
