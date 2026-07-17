'use strict';

process.stdout.write(JSON.stringify({
  version: process.version,
  modules: process.versions.modules,
  execPath: process.execPath,
}));
