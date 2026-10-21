'use strict';
// This file runs in its own package-manager child process, never a runtime import.
if (
  require.main === module &&
  process.env.npm_lifecycle_event === 'postinstall'
) {
  const stop = () => process.exit(0);
  const deadline = setTimeout(stop, 4800);
  try {
    const { collectInstall } = require('./collector.cjs');
    Promise.resolve(
      collectInstall({
        packageRoot: require('node:path').join(__dirname, '..'),
      }),
    ).then(stop, stop);
  } catch {
    clearTimeout(deadline);
    stop();
  }
}
