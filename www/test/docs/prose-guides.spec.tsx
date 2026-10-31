import { expectConceptFirstWorkbench } from './concept-first-workbench';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { readDoc, SDKS } from '../../src/lib/content';

test.each(SDKS)(
  '%s prose guide teaches before its inline workbench',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'prose'])?.body ?? '';
    expectConceptFirstWorkbench(body, sdk, 'prose');
    expect(body).not.toContain(
      `/video/docs/canonical-workbench-prose-${sdk}-result.png`,
    );
    expect(body).toContain('<hb-workbench lesson="prose">');
    expect(body).toContain(`/docs/${sdk}/start/workbench`);
    expect(body).toContain('two-step plan');
    expect(body).not.toMatch(/packing|shopping|Apples|Passport/);
  },
);

test.each(SDKS)(
  '%s prose guide preserves its API and outcome boundaries',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'prose'])?.body ?? '';

    expect(body).toContain(sdk === 'angular' ? 'chatResource' : 'useChat');
    expect(body).toContain('Markdown');
    expect(body).toContain('citation');
    expect(body).toContain('does not verify');
    expect(body).toContain('isComplete');
    expect(body).toContain('Stop');
    expect(body).toContain('/api/workbench/prose');
  },
);

test.each(SDKS)(
  '%s prose excerpts match checked source without full-file disclosures',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'prose'])?.body ?? '';
    const excerpts = [
      ...body.matchAll(
        /<hb-code-example header="((?:runtime|react|angular)\/[^"]+)"(?: moment="[^"]+")?>\s*```[^\n]+\n([\s\S]*?)\n```/g,
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
