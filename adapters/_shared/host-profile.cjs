'use strict';

// One-cycle compatibility import. The installed Skill owns the live delegation
// profile so package CLI users and direct Skill callers execute the same contract.
module.exports = require('../../skills/ultra-delegate/scripts/host-profile.cjs');
