import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { readDoc, SDKS } from '../../src/lib/content';

test.each(SDKS)('%s Magic Text starts with its own recorded result', (sdk) => {
  const body = readDoc(sdk, ['recipes', 'magic-text'])?.body ?? '';

  const demo = body.indexOf('<hb-docs-demo demo="magic-text">');

  expect(demo).toBeGreaterThan(-1);
  expect(demo).toBeLessThan(body.indexOf('\n## '));
  expect(body).toContain('/video/docs/magic-text-result.png');
  expect(body).toContain('scripted');
  expect(body).toContain('no live model');
});

test.each(SDKS)(
  '%s Magic Text publishes the complete checked files in closed disclosures',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'magic-text'])?.body ?? '';
    const files = [
      'runtime/magic-text.ts',
      sdk === 'react'
        ? 'react/src/MagicTextDemo.tsx'
        : 'angular/src/app/magic-text-demo.ts',
    ];

    for (const file of files) {
      const expander =
        body
          .split(`<hb-expander title="Complete ${file}">`)[1]
          ?.split('</hb-expander>')[0] ?? '';
      const snippet = expander.match(/```(?:ts|tsx)\n([\s\S]*?)\n```/)?.[1];

      expect(expander).toContain(`<hb-code-example header="${file}">`);
      expect(snippet?.trim(), file).toBe(
        readFileSync(
          resolve(import.meta.dirname, '../../examples/quickstart', file),
          'utf8',
        ).trim(),
      );
      expect(expander).not.toContain('default-open');
    }
  },
);

test.each(SDKS)(
  '%s Magic Text keeps setup, outcome and recovery visible',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'magic-text'])?.body ?? '';

    const visible = body.replace(/<hb-expander\b[\s\S]*?<\/hb-expander>/g, '');

    expect(visible).toContain('## Before we start');
    expect(visible).toContain(`/docs/${sdk}/start/quick`);
    expect(visible).toContain('/api/chat');
    expect(visible).toContain('OPENAI_API_KEY');
    expect(visible).toContain('OPENAI_MODEL');
    expect(visible).toContain('Generate reply');
    expect(visible).toContain('Cancel');
    expect(visible).toContain('fresh user message');
    expect(visible).toContain('unresolved');
    expect(visible).toContain('does not verify');
    expect(visible).toContain('does not mean the answer succeeded');
    expect(visible).toContain('Reply ended early.');
    expect(visible).toContain('## If the reply does not appear');
  },
);

test.each(SDKS)(
  '%s Magic Text links optional APIs without repeating an unchecked renderer inventory',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'magic-text'])?.body ?? '';
    const renderer = sdk === 'react' ? 'MagicTextRendererProps' : 'MagicText';

    expect(body).toContain(`/api/${sdk}/${renderer}`);
    expect(body).toContain(`/api/${sdk}/exposeMarkdown`);
    expect(body).toContain(
      `/docs/${sdk}/migrations/v0-6#magic-text-and-json-parser-internals`,
    );
    expect(body).not.toContain('All node types and the directive to use');
    expect(body).not.toContain('options={{ segmenter:');
    expect(body).not.toContain('[options]="{ segmenter:');
  },
);
