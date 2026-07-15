'use strict';

const path = require('node:path');

// ncc emits this entrypoint into <plugin>/runtime/ultra-tools.cjs. Set the
// runtime asset root before loading modules that read schemas or templates.
process.env.UBP_RUNTIME_ROOT = path.resolve(__dirname, '..');

const { main } = require('../../ultra-tools/cli.cjs');

main(process.argv);
