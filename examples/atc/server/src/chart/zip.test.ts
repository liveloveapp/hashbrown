import { expect, test } from 'vitest';
import { makeZip } from './test-zip';
import { readZipEntries } from './zip';

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
