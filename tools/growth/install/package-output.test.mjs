import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const config = join(root, 'packages/core/package-output.config.cjs');

test('core module output stays anchored to its source regardless of caller working directory', () => {
  const script = `
const configure = require(${JSON.stringify(config)});
const output = configure({ output: [{ format: 'esm' }, { format: 'cjs' }] }).output;
console.log(JSON.stringify(output.map(item => item.preserveModulesRoot)));
`;

  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: tmpdir(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    join(root, 'packages/core/src'),
    join(root, 'packages/core/src'),
  ]);
});
