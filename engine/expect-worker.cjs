'use strict';

const { parentPort, workerData } = require('node:worker_threads');

parentPort.postMessage(new RegExp(workerData.expect, 'mu').test(workerData.output));
