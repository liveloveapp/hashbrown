import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('future public source rejects resealed unrelated producer and missing official receipts before network', () => {
  const verifier = pathToFileURL(
    resolve(__dirname, '../release-consumer/qualify.mjs'),
  ).href;
  const script = `
import assert from 'node:assert/strict';
const { qualifyPublicProducer } = await import(${JSON.stringify(verifier)});
let network = 0;
globalThis.fetch = async () => { network++; throw new Error('unexpected network'); };
for (const producer of [
  {}, { revision: 'main' }, { revision: 'a'.repeat(40), sourceUrl: 'https://example.org/fake.zip' },
  { revision: 'a'.repeat(40), sourceUrl: 'https://codeload.github.com/liveloveapp/hashbrown/zip/' + 'b'.repeat(40) },
]) await assert.rejects(() => qualifyPublicProducer(producer));
assert.equal(network, 0);
console.log('public missing receipts rejected before network');
`;

  const output = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    { encoding: 'utf8', timeout: 20_000 },
  );

  expect(output).toContain('public missing receipts rejected before network');
});
