import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { readDoc, SDKS } from '../../src/lib/content';

test.each(SDKS)(
  '%s selection recipe leads with the recorded app-owned views',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'ui-selection'])?.body ?? '';

    const media = body.indexOf('<hb-docs-demo demo="ui-selection">');

    expect(media).toBeGreaterThan(-1);
    expect(media).toBeLessThan(body.indexOf('\n## '));
    expect(body).toContain('/video/docs/ui-selection-result.png');
    expect(body).toContain('2 products');
    expect(body).toContain('3 total items');
    expect(body).toContain('scripted');
  },
);

test.each(SDKS)(
  '%s selection recipe publishes exact checked source in closed disclosures',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'ui-selection'])?.body ?? '';
    const files = [
      'runtime/selection.ts',
      sdk === 'react'
        ? 'react/src/UiSelection.tsx'
        : 'angular/src/app/ui-selection.ts',
      'server/selection-server.ts',
    ];

    for (const file of files) {
      const section = body.split(`<hb-code-example header="${file}">`)[1];
      const source = readFileSync(
        resolve(import.meta.dirname, '../../examples/quickstart', file),
        'utf8',
      ).trim();

      expect(body).toContain(`<hb-expander title="Complete ${file}">`);
      expect(body).not.toMatch(/<hb-expander[^>]*\bopen[=>\s]/);
      expect(section?.match(/```[^\n]+\n([\s\S]*?)\n```/)?.[1].trim()).toBe(
        source,
      );
    }
  },
);

test.each(SDKS)(
  '%s selection setup explains the decision endpoint and explicit recovery',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'ui-selection'])?.body ?? '';

    const visible = body.replace(/<hb-expander\b[\s\S]*?<\/hb-expander>/g, '');

    for (const required of [
      'TYPESAFE_API_KEY',
      'TYPESAFE_MODEL',
      '/api/decide',
      '/api/chat',
      '127.0.0.1:3001',
      "select: 'one'",
      'minConfidence: 0.7',
      'null',
      'Show summary',
      'Show items',
      'same order',
      'local development',
      'latest',
      'authorization',
    ]) {
      expect(visible).toContain(required);
    }
    expect(visible).toContain(
      sdk === 'react'
        ? "decision={{ url: '/api/decide' }}"
        : "decision: { url: '/api/decide' }",
    );
    expect(visible).toContain(`/docs/${sdk}/platform/typesafe`);
    expect(visible).toContain(`/docs/${sdk}/concept/decisions`);
    expect(visible).toContain('chat mode');
    expect(visible).toContain('all components');
    expect(visible).toContain('restores');
  },
);
