import { inflateRawSync } from 'node:zlib';

/**
 * Reads every file in a zip archive as UTF-8 text, keyed by name. Supports
 * stored and deflated entries (all NASR uses). Reads sizes from the central
 * directory, so data descriptors do not matter.
 */
export function readZipEntries(zip: Uint8Array): Map<string, string> {
  const buffer = Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = -1;
  for (
    let i = buffer.length - 22;
    i >= Math.max(0, buffer.length - 65_557);
    i--
  ) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('Not a zip archive');
  const count = buffer.readUInt16LE(end + 10);
  let pointer = buffer.readUInt32LE(end + 16);
  const entries = new Map<string, string>();
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(pointer) !== 0x02014b50)
      throw new Error('Corrupt zip directory');
    const method = buffer.readUInt16LE(pointer + 10);
    const compressed = buffer.readUInt32LE(pointer + 20);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString(
      'utf8',
      pointer + 46,
      pointer + 46 + nameLength,
    );
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(start, start + compressed);
    if (method !== 0 && method !== 8)
      throw new Error(`Unsupported zip method ${method}`);
    entries.set(
      name,
      (method === 0 ? data : inflateRawSync(data)).toString('utf8'),
    );
    pointer += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}
