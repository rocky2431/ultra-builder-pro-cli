'use strict';
// The identical finite allowed/denied probe, with separate Stage C evidence names.
require('./step5-pi-product-probe.cjs').main({ prefix: 'stage-c' }).catch((error) => { console.error(error); process.exitCode = 1; });
