'use strict';

// Compatibility surface for one release cycle. The installed Skill owns the
// implementation used by both `ubp delegate` and direct Skill invocation.
module.exports = require('../skills/ultra-delegate/scripts/delegate.cjs');
