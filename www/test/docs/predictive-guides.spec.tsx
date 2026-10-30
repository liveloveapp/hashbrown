import { expectConceptFirstWorkbench } from './concept-first-workbench';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { readDoc, SDKS } from '../../src/lib/content';

test.each(SDKS)(
  '%s predictive guide teaches before its inline workbench',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'predictive-actions'])?.body ?? '';
    expectConceptFirstWorkbench(body, sdk, 'predictions');
    expect(body).not.toContain(
      `/video/docs/canonical-workbench-predictions-${sdk}-result.png`,
    );
    expect(body).toContain('<hb-workbench lesson="predictions">');
    expect(body).toContain(`/docs/${sdk}/start/workbench`);
    expect(body).toContain('two-step plan');
    expect(body).not.toMatch(/packing|shopping|Apples|Passport/);
  },
);

test.each(SDKS)(
  '%s predictive guide preserves its API and outcome boundaries',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'predictive-actions'])?.body ?? '';

    expect(body).toContain(
      sdk === 'angular'
        ? 'structuredCompletionResource'
        : 'useStructuredCompletion',
    );
    expect(body).toContain('contextId');
    expect(body).toContain('empty array');
    expect(body).toContain('Accept');
    expect(body).toContain('Dismiss');
    expect(body).toContain('revision');
    expect(body).toContain('stale');
    expect(body).toContain('/api/workbench/predictions');
  },
);

test.each(SDKS)(
  '%s predictive excerpts match checked source without full-file disclosures',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'predictive-actions'])?.body ?? '';
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
