'use strict';

const fs = require('node:fs');
const { spawn } = require('node:child_process');

const {
  AgentExecutionDriver,
  BoundedCapture,
  DEFAULT_CAPTURE_LIMIT_BYTES,
  terminateProcessGroup,
} = require('./agent-execution-driver.cjs');

class CliDriver extends AgentExecutionDriver {
  run() {
    const spec = this.spec;
    return new Promise((resolve) => {
      const limit = spec.capture_limit_bytes || DEFAULT_CAPTURE_LIMIT_BYTES;
      const stdout = new BoundedCapture(limit);
      const stderr = new BoundedCapture(limit);
      let termination = null;
      let spawnError = null;
      let closed = false;
      let hardKill = null;
      const child = spawn(spec.command, spec.args, {
        cwd: spec.cwd,
        env: { ...process.env, ...spec.env },
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.on('data', (chunk) => stdout.append(chunk));
      child.stderr.on('data', (chunk) => stderr.append(chunk));
      const finish = (code, signal) => {
        if (closed) return;
        closed = true;
        clearInterval(cancelPoll);
        clearTimeout(timeout);
        if (hardKill) clearTimeout(hardKill);
        stdout.write(spec.stdout);
        stderr.write(spec.stderr);
        resolve({ code, signal, termination, spawnError });
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
