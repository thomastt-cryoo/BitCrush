'use strict';
// The Codex runtime sets ELECTRON_SKIP_BINARY_DOWNLOAD. Clear it only in this
// isolated installer process so the explicitly pinned stock runtime is acquired.
for (const key of Object.keys(process.env)) {
  if (key.toLowerCase() === 'electron_skip_binary_download') delete process.env[key];
}
console.log(JSON.stringify({ action: 'install-stock-electron', version: require('electron/package.json').version, cwd: process.cwd(), skip: process.env.ELECTRON_SKIP_BINARY_DOWNLOAD || null }));
require('./node_modules/electron/install.js');
