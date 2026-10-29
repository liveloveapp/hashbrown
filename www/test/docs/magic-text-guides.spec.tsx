import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { readDoc, SDKS } from '../../src/lib/content';

test.each(SDKS)(
  '%s magic-text guide opens with its canonical framework recording',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'magic-text'])?.body ?? '';
    const marker = `<hb-workbench lesson="magic-text">`;

    expect(body.indexOf(marker)).toBeGreaterThan(-1);
    expect(body.indexOf(marker)).toBeLessThan(body.indexOf('\n## '));
    expect(body).toContain(
      `/video/docs/canonical-workbench-magic-text-${sdk}-result.png`,
    );
    expect(body).toContain(`/${sdk}.html?lesson=magic-text`);
    expect(body).toContain(`/docs/${sdk}/start/workbench`);
    expect(body).toContain('two-step plan');
    expect(body).not.toMatch(/packing|shopping|Apples|Passport/);
  },
);

test.each(SDKS)(
  '%s magic-text guide preserves its API and outcome boundaries',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'magic-text'])?.body ?? '';

    expect(body).toContain(sdk === 'angular' ? 'chatResource' : 'useChat');
    expect(body).toContain('Markdown');
    expect(body).toContain('citation');
    expect(body).toContain('does not verify');
    expect(body).toContain('isComplete');
    expect(body).toContain('Stop');
    expect(body).toContain('/api/workbench/magic-text');
  },
);

test.each(SDKS)(
  '%s magic-text excerpts match checked source without full-file disclosures',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'magic-text'])?.body ?? '';
    const excerpts = [
      ...body.matchAll(
        /<hb-code-example header="((?:runtime|react|angular)\/[^"]+)">\s*```[^\n]+\n([\s\S]*?)\n```/g,
      ),
    ];
    const normalize = (text: string) =>
      text
        .split('\n')
        .map((line) => line.trim())
        .join('\n')
        .trim();

    for (const [, file, excerpt] of excerpts) {
      const checked = readFileSync(
        resolve(import.meta.dirname, '../../examples/quickstart', file),
        'utf8',
      );

      expect(normalize(checked), file).toContain(normalize(excerpt));
    }
    expect(excerpts.length).toBeGreaterThan(0);
    expect(body).not.toMatch(/<hb-expander[^>]*\bopen[=>\s]/);
  },
);
