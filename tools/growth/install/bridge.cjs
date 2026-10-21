'use strict';
const fs = require('node:fs/promises');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');

/** Bridge module file names written at the package root. */
const BRIDGE_FILES = ['development-install.mjs', 'development-install.cjs'];

/** Renders the bridge module source for the given module format. */
const moduleSource = (token, format) =>
  format === 'cjs'
    ? `'use strict';\nexports.installationToken = ${JSON.stringify(token)};\n`
    : `export const installationToken = ${JSON.stringify(token)};\n`;

async function writeOne(packageRoot, name, source) {
  const destination = join(packageRoot, name);
  let temporary;
  try {
    const existing = await fs.lstat(destination).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return undefined;
    });
    if (existing && !existing.isFile()) return false;
    temporary = join(packageRoot, `.${name}-${randomUUID()}.tmp`);
    await fs.writeFile(temporary, source, { flag: 'wx', mode: 0o644 });
    await fs.rename(temporary, destination);
    return true;
  } catch {
    return false;
  } finally {
    if (temporary) await fs.unlink(temporary).catch(() => undefined);
  }
}

/**
 * Writes both bridge modules atomically (temporary file then rename). Failure
 * never affects installation; returns false if either file could not be written.
 */
async function writeBridge(packageRoot, token) {
  const results = await Promise.all([
    writeOne(packageRoot, BRIDGE_FILES[0], moduleSource(token, 'esm')),
    writeOne(packageRoot, BRIDGE_FILES[1], moduleSource(token, 'cjs')),
  ]);
  return results.every(Boolean);
}
module.exports = { BRIDGE_FILES, moduleSource, writeBridge };
