import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const guide = (sdk: string) =>
  readFileSync(
    resolve(
      import.meta.dirname,
      `../../content/docs/${sdk}/concept/transform-request-options.md`,
    ),
    'utf8',
  );

test.each(['react', 'angular'])(
  '%s transformation guide opens with its real canonical recording',
  (sdk) => {
    const body = guide(sdk);

    const marker = `<hb-workbench lesson="request-transformation">`;

    expect(body.indexOf(marker)).toBeGreaterThan(-1);
    expect(body.indexOf(marker)).toBeLessThan(body.indexOf('\n## '));
    expect(body).toContain(
      `/video/docs/canonical-workbench-request-transformation-${sdk}-result.png`,
    );
    expect(body).toContain(`/${sdk}.html?lesson=request-transformation`);
    expect(body).toContain('OPENAI_API_KEY');
    expect(body).toContain('OPENAI_MODEL');
    expect(body).toContain('npx nx workbench-serve www');
    expect(body).toContain('actual callback');
    expect(body).toContain('authorization');
    expect(body).toContain('reasoning.encrypted_content');
    expect(body).toContain('fail closed');
    expect(body).not.toContain('return options;');
  },
);

test.each(['react', 'angular'])(
  '%s transformation excerpts match the checked server',
  (sdk) => {
    const body = guide(sdk);
    const excerpts = [
      ...body.matchAll(
        /<hb-code-example header="(server\/[^"]+)">\s*```[^\n]+\n([\s\S]*?)\n```/g,
      ),
    ];
    const normalize = (value: string) =>
      value
        .split('\n')
        .map((line) => line.trim())
        .join('\n')
        .trim();

    for (const [, file, excerpt] of excerpts) {
      const source = readFileSync(
        resolve(import.meta.dirname, '../../examples/quickstart', file),
        'utf8',
      );

      expect(normalize(source), file).toContain(normalize(excerpt));
    }
    expect(excerpts.length).toBeGreaterThanOrEqual(2);
  },
);
