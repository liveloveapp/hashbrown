import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { readDoc, SDKS } from '../../src/lib/content';

test.each(SDKS)(
  '%s concept lessons share the canonical plan and framework-specific recordings',
  (sdk) => {
    const lessons = [
      ['components', 'ui'],
      ['functions', 'tools'],
      ['structured-output', 'structured'],
    ] as const;

    for (const [slug, lesson] of lessons) {
      const body = readDoc(sdk, ['concept', slug])?.body ?? '';
      const marker = `<hb-docs-demo demo="canonical-workbench-${lesson}-${sdk}">`;

      expect(body.indexOf(marker)).toBeGreaterThan(-1);
      expect(body.indexOf(marker)).toBeLessThan(body.indexOf('\n## '));
      expect(body).toContain('two-step plan');
      expect(body).toContain(
        `/${sdk}.html?lesson=${slug === 'components' ? 'generative-ui' : slug === 'functions' ? 'tools' : 'structured-output'}`,
      );
      expect(body).toContain(`/docs/${sdk}/start/workbench`);
      expect(body).toContain('Accept plan');
      expect(body).not.toMatch(/shopping-list|MarkdownComponent|fetchUser/);
    }
  },
);

test.each(SDKS)(
  '%s lesson excerpts come directly from the checked workbench clients',
  (sdk) => {
    const pages = ['components', 'functions', 'structured-output'].map(
      (slug) => readDoc(sdk, ['concept', slug])?.body ?? '',
    );
    let checked = 0;

    for (const body of pages) {
      for (const match of body.matchAll(
        /<hb-code-example header="((?:react|angular|runtime)\/[^"]+)">\s*```[^\n]+\n([\s\S]*?)\n```/g,
      )) {
        const source = readFileSync(
          resolve(import.meta.dirname, '../../examples/quickstart', match[1]),
          'utf8',
        );
        const normalize = (value: string) =>
          value
            .split('\n')
            .map((line) => line.trim())
            .join('\n')
            .trim();

        expect(normalize(source), match[1]).toContain(normalize(match[2]));
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(4);
  },
);
