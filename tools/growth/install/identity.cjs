'use strict';
const fs = require('node:fs/promises');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const { readBounded } = require('./files.cjs');
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Reads or creates the per-user installation id, falling back to memory. */
async function installationIdentity(home) {
  const fallback = { id: randomUUID(), scope: 'memory' };
  let temporary;
  try {
    const directory = join(home, '.hashbrown'),
      target = join(directory, 'installation-id');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return fallback;
    const existing = await readBounded(target, 40);
    if (existing && UUID.test(existing.trim()))
      return { id: existing.trim().toLowerCase(), scope: 'persistent' };
    temporary = join(directory, `.installation-${randomUUID()}.tmp`);
    await fs.writeFile(temporary, fallback.id, { flag: 'wx', mode: 0o600 });
    try {
      await fs.link(temporary, target);
    } catch (error) {
      if (error.code !== 'EEXIST') return fallback;
    }
    const winner = await readBounded(target, 40);
    if (winner && UUID.test(winner.trim()))
      return { id: winner.trim().toLowerCase(), scope: 'persistent' };
  } catch {
    /* Storage cannot prevent installation. */
  } finally {
    if (temporary) await fs.unlink(temporary).catch(() => undefined);
  }
  return fallback;
}
module.exports = { installationIdentity };
