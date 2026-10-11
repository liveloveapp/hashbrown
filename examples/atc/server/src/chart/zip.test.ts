import { deflateRawSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { readZipEntries } from './zip';

/** A minimal zip archive with one entry per file (deflate unless `stored`). */
function makeZip(files: Record<string, string>, stored = false): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, 'utf8');
    const data = stored ? raw : deflateRawSync(raw);
    const nameBytes = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);

  return new Uint8Array(Buffer.concat([...locals, centralDir, end]));
}

test('reads deflated entries by name', () => {
  const zip = makeZip({ 'APT_BASE.csv': 'a,b\n1,2\n', 'README.txt': 'hi' });

  const entries = readZipEntries(zip);

  expect(entries.get('APT_BASE.csv')).toBe('a,b\n1,2\n');
  expect(entries.get('README.txt')).toBe('hi');
});

test('reads stored entries', () => {
  const zip = makeZip({ 'FRQ.csv': 'x\n' }, true);

  const entries = readZipEntries(zip);

  expect(entries.get('FRQ.csv')).toBe('x\n');
});

test('rejects data that is not a zip', () => {
  const notZip = new Uint8Array([1, 2, 3, 4]);

  expect(() => readZipEntries(notZip)).toThrow(/zip/i);
});
