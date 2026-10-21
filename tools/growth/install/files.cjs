'use strict';
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
/** Reads a regular file up to a size bound; null when absent, unsafe or too large. */
async function readBounded(path, maximum = 65536) {
  let file;
  try {
    // Nonblocking open avoids waiting on FIFOs; never follow a final symlink.
    file = await fs.open(
      path,
      constants.O_RDONLY |
        (constants.O_NOFOLLOW ?? 0) |
        (constants.O_NONBLOCK ?? 0),
    );
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maximum) return null;
    const buffer = Buffer.alloc(maximum + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    return bytesRead <= maximum
      ? buffer.subarray(0, bytesRead).toString('utf8')
      : null;
  } catch {
    return null;
  } finally {
    await file?.close().catch(() => undefined);
  }
}
module.exports = { readBounded };
