import { inflateRawSync } from 'node:zlib';

/** The end-of-central-directory record's signature. */
export const EOCD_SIGNATURE = 0x06054b50;
/** A central directory file header's signature. */
export const CENTRAL_SIGNATURE = 0x02014b50;
/** A local file header's signature. */
export const LOCAL_SIGNATURE = 0x04034b50;
/** The end-of-central-directory record's size without its comment, in bytes. */
export const EOCD_SIZE = 22;
/** A central directory file header's size before its name, in bytes. */
export const CENTRAL_HEADER_SIZE = 46;
/** A local file header's size before its name, in bytes. */
export const LOCAL_HEADER_SIZE = 30;
/** The longest zip comment, in bytes. */
const MAX_COMMENT = 65_535;

/**
 * Reads every file in a zip archive as UTF-8 text, keyed by name. Supports
 * stored and deflated entries (all NASR uses). Reads sizes from the central
 * directory, so data descriptors do not matter.
 */
export function readZipEntries(zip: Uint8Array): Map<string, string> {
  const buffer = Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = -1;
  // The end-of-central-directory record is the last 22 bytes plus a comment
  // of up to 65,535 bytes, so search backwards no further than that.
  for (
    let i = buffer.length - EOCD_SIZE;
    i >= Math.max(0, buffer.length - EOCD_SIZE - MAX_COMMENT);
    i--
  ) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      end = i;
      break;
    }
  }
  if (end < 0) {
    throw new Error('Not a zip archive');
  }
  const count = buffer.readUInt16LE(end + 10);
  let pointer = buffer.readUInt32LE(end + 16);
  const entries = new Map<string, string>();
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(pointer) !== CENTRAL_SIGNATURE) {
      throw new Error('Corrupt zip directory');
    }
    const method = buffer.readUInt16LE(pointer + 10);
    const compressed = buffer.readUInt32LE(pointer + 20);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString(
      'utf8',
      pointer + CENTRAL_HEADER_SIZE,
      pointer + CENTRAL_HEADER_SIZE + nameLength,
    );
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start =
      localOffset + LOCAL_HEADER_SIZE + localNameLength + localExtraLength;
    const data = buffer.subarray(start, start + compressed);
    if (method !== 0 && method !== 8) {
      throw new Error(`Unsupported zip method ${method}`);
    }
    entries.set(
      name,
      (method === 0 ? data : inflateRawSync(data)).toString('utf8'),
    );
    pointer += CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength;
  }

  return entries;
}
