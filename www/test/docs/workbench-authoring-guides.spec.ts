import { expect, test } from 'vitest';
import { readDoc } from '../../src/lib/content';

test.each(['react', 'angular'] as const)(
  '%s authoring recipes lead with canonical recorded behavior and checked sources',
  (sdk) => {
    for (const [slug, lesson] of [
      ['decisions-in-agents', 'agent-decisions'],
      ['json-parser', 'json-parser'],
      ['natural-language-to-structured-data', 'natural-forms'],
    ]) {
      const body = readDoc(sdk, ['recipes', slug])?.body ?? '';

      const demo = body.indexOf(
        `<hb-docs-demo demo="canonical-workbench-${lesson}-${sdk}">`,
      );

      expect(demo).toBeGreaterThan(-1);
      expect(demo).toBeLessThan(body.indexOf('\n## '));
      expect(body).toContain(`canonical-workbench-${lesson}-${sdk}-result.png`);
      expect(body).toContain('Replay');
      expect(body).toContain('workbench-authoring.ts');
      expect(body).not.toContain('scripted decision responses');
      expect(body).not.toContain('finite local timer supplies');
    }
  },
);

test.each(['react', 'angular'] as const)(
  '%s recipes explain decision, parser and form trust boundaries',
  (sdk) => {
    const agent = readDoc(sdk, ['recipes', 'decisions-in-agents'])?.body ?? '';
    const parser = readDoc(sdk, ['recipes', 'json-parser'])?.body ?? '';
    const form =
      readDoc(sdk, ['recipes', 'natural-language-to-structured-data'])?.body ??
      '';

    expect(agent).toContain('0.75');
    expect(agent).toContain('TypeSafe');
    expect(agent).toContain('whole');
    expect(agent).toContain('authorization');
    expect(parser).toContain(
      sdk === 'react' ? 'useJsonParser' : 'injectJsonParser',
    );
    expect(parser).toContain('original JSON');
    expect(parser).toContain('source');
    expect(form).toContain('Review draft');
    expect(form).toContain('Apply plan');
    expect(form).toContain('readContext');
    expect(form).toContain('revision');
  },
);
