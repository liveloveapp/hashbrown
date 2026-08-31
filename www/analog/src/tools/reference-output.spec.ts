import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { resetReferenceOutput } from './reference-output';

test('removes stale API reference files before generation', () => {
  const outputPath = mkdtempSync(join(tmpdir(), 'hashbrown-reference-'));
  const packagePath = join(outputPath, 'core');
  const staleSymbolPath = join(packagePath, 'RemovedSymbol.json');
  mkdirSync(packagePath);
  writeFileSync(staleSymbolPath, '{}');

  try {
    resetReferenceOutput(outputPath);

    expect(existsSync(outputPath)).toBe(true);
    expect(readdirSync(outputPath)).toEqual([]);
  } finally {
    rmSync(outputPath, { recursive: true, force: true });
  }
});
