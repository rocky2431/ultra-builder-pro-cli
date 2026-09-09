'use strict';

const fs = require('node:fs');
const { spawn } = require('node:child_process');

const {
  AgentExecutionDriver,
  BoundedCapture,
  DEFAULT_CAPTURE_LIMIT_BYTES,
  descendantSpawnEnv,
  markWriterLaunching,
  observeWriterStart,
  rewindWriterNotStarted,
  terminateProcessGroup,
} = require('./agent-execution-driver.cjs');

class CliDriver extends AgentExecutionDriver {
  run() {
    const spec = this.spec;
    const native = spec.native_permission === 'pi' ? require('./pi-native-runtime.cjs') : null;
    const identityDrift = native ? native.piNativeIdentityDrift(spec) : null;
    if (identityDrift) {
      return Promise.resolve({
        code: null, signal: null, termination: null, spawnError: null,
        failureType: 'pi_native_identity_changed',
        failureSummary: `Pi was not launched: ${identityDrift}`,
      });
    }
    // A Host that cannot be observed must not be launched: without a durable
    // launching observation the writer boundary would stay unknowable.
    if (!markWriterLaunching(spec)) {
      return Promise.resolve({
        code: null,
        signal: null,
        termination: null,
        spawnError: null,
        failureType: 'writer_observation_unavailable',
        failureSummary: 'The host was not launched because its writer observation could not be persisted.',
      });
    }
    const limit = spec.capture_limit_bytes || DEFAULT_CAPTURE_LIMIT_BYTES;
    const stdout = new BoundedCapture(limit);
    const stderr = new BoundedCapture(limit);
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: descendantSpawnEnv(spec),
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // A real PID that was not durably recorded can never be proven stopped
    // later, so the known child boundary is terminated immediately and the
    // driver fails without performing any useful Host work.
    if (Number.isInteger(child.pid) && child.pid > 0 && !observeWriterStart(spec, child)) {
      child.on('error', () => {});
      child.stdout.on('data', () => {});
      child.stderr.on('data', () => {});
      terminateProcessGroup(child, 'SIGKILL');
      stdout.write(spec.stdout);
      stderr.write(spec.stderr);
      return Promise.resolve({
        code: null,
        signal: null,
        termination: null,
        spawnError: null,
        failureType: 'writer_start_unobserved',
        failureSummary: 'The host PID existed but its started writer observation could not be persisted; the child boundary was terminated and no host work was performed.',
      });
    }
    return new Promise((resolve) => {
      let termination = null;
      let spawnError = null;
      let closed = false;
      let hardKill = null;
      child.stdout.on('data', (chunk) => stdout.append(chunk));
      child.stderr.on('data', (chunk) => stderr.append(chunk));
      const finish = (code, signal) => {
        if (closed) return;
        closed = true;
        clearInterval(cancelPoll);
        clearTimeout(timeout);
        if (hardKill) clearTimeout(hardKill);
        if (spawnError && !Number.isInteger(child.pid)) {
          // An OS-confirmed spawn failure with no child PID restores an
          // explicit releasable not_started proof instead of freezing an
          // impossible writer behind a launch that never existed.
          rewindWriterNotStarted(spec, { allowedPriorPhases: ['launching'] });
        }
        stdout.write(spec.stdout);
        stderr.write(spec.stderr);
        let nativeOutcome = {};
        if (native && !termination && !spawnError) {
          const observed = stdout.truncated || stderr.truncated
            ? { failureType: 'pi_native_incomplete', failureSummary: 'The native Pi trace exceeded the existing capture limit.' }
            : native.consumePiNative(stdout.text(), stderr.text(), spec.env[native.CONFIG_ENV]);
          const { assistantText, permissionEvents, ...facts } = observed;
          nativeOutcome = facts;
          fs.writeFileSync(spec.events, (permissionEvents || []).map((event) => JSON.stringify(event)).join('\n') + '\n', { mode: 0o600 });
          if (code === 0 && !observed.failureType && typeof assistantText === 'string') {
            fs.writeFileSync(spec.host_output, assistantText, { mode: 0o600 });
          }
        }
        resolve({ code, signal, termination, spawnError, ...nativeOutcome });
      };
      child.on('error', (error) => { spawnError = error; });
      child.on('close', finish);
      const requestTermination = (reason) => {
        if (termination) return;
        termination = reason;
        terminateProcessGroup(child);
        hardKill = setTimeout(() => terminateProcessGroup(child, 'SIGKILL'), 1500);
        hardKill.unref();
      };
      const cancelPoll = setInterval(() => {
        if (fs.existsSync(spec.cancel)) requestTermination('cancelled');
      }, 100);
      const timeout = setTimeout(() => requestTermination('timeout'), spec.timeout_ms);
      cancelPoll.unref();
      timeout.unref();
    });
  }
}

module.exports = { CliDriver };
