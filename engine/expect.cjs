'use strict';

const path = require('node:path');
const { Worker } = require('node:worker_threads');

const signals = require('./signals.cjs');

function expectOutput(expect, output) {
  return new Promise((resolve, reject) => {
    // Isolate the acceptance author's regexp so its backtracking has a 5-second limit.
    const worker = new Worker(path.join(__dirname, 'expect-worker.cjs'),
      { workerData: { expect, output } });
    let finished = false;
    const handlers = Object.entries(signals).map(([signal, exitCode]) =>
      [signal, () => finish(null, Object.assign(new Error('Check interrupted.'), { exitCode }))]);
    const finish = (result, error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      for (const [signal, handler] of handlers) process.off(signal, handler);
      worker.terminate().then(() => error ? reject(error) : resolve(result), reject);
    };
    const timer = setTimeout(() => finish('expect-timeout'), 5000);
    for (const [signal, handler] of handlers) process.on(signal, handler);
    worker.once('message', (matches) => finish(matches ? 'exit-0' : 'expect-unmet'));
    worker.once('error', (error) => finish(null, error));
    worker.once('exit', (code) => {
      if (!finished) finish(null, new Error(`Expect worker exited without a result (${code}).`));
    });
  });
}

module.exports = { expectOutput };
