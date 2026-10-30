import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const read = (path: string) =>
  readFileSync(
    resolve(import.meta.dirname, '../../content/docs', path),
    'utf8',
  );

test.each(['react', 'angular'])(
  '%s server guides use their inline workbench and explain application boundaries',
  (sdk) => {
    const threads = read(`${sdk}/recipes/threads.md`);
    const endpoint = read(`${sdk}/recipes/public-endpoint.md`);

    expect(threads).toContain('<hb-workbench lesson="server-threads">');
    expect(endpoint).toContain('<hb-workbench lesson="public-endpoint">');
    expect(threads).toContain('409');
    expect(threads).toContain('expectedVersion');
    expect(threads).toContain('checkpoint');
    expect(threads).toContain('process');
    expect(endpoint).toContain('401');
    expect(endpoint).toContain('404');
    expect(endpoint).toContain('Origin');
    expect(endpoint).toContain('local demo session');
    expect(endpoint).not.toContain('scripted provider output');
    for (const content of [threads, endpoint]) {
      expect(content).not.toContain('-result.png');
      expect(content).toContain('Replay');
      expect(content).toContain('workbench-threads.ts');
    }
  },
);
