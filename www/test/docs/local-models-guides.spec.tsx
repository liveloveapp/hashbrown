import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { readDoc, SDKS } from '../../src/lib/content';

test.each(SDKS)(
  '%s local-model recipe leads with recorded native inference',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'local-models'])?.body ?? '';

    const demo = body.indexOf('<hb-docs-demo demo="local-models">');

    expect(demo).toBeGreaterThan(-1);
    expect(demo).toBeLessThan(body.indexOf('\n## '));
    expect(body).toContain('/video/docs/local-models-result.png');
    expect(body).toContain('real Chrome');
    expect(body).toContain('Prepare model');
    expect(body).toContain('Generate locally');
  },
);

test.each(SDKS)(
  '%s local-model recipe publishes its checked source in closed disclosures',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'local-models'])?.body ?? '';
    const files = [
      'runtime/local-models.ts',
      sdk === 'react'
        ? 'react/src/LocalModels.tsx'
        : 'angular/src/app/local-models.ts',
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
  '%s local setup distinguishes native browsers, WebLLM, localhost and recovery',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'local-models'])?.body ?? '';

    const visible = body.replace(/<hb-expander\b[\s\S]*?<\/hb-expander>/g, '');

    for (const text of [
      'Three days in Lisbon',
      'Prepare model',
      'Generate locally',
      'Cancel',
      'download',
      'unavailable',
      'Edge',
      'WebLLM',
      'Ollama',
      'no automatic hosted fallback',
      'desktop',
      'telemetry',
    ])
      expect(visible).toContain(text);
    expect(body).toContain('experimental_webllm');
    expect(body).toContain('experimental_chrome');
    expect(body).toContain('https://developer.chrome.com/docs/ai/prompt-api');
    expect(body).toContain(
      'https://learn.microsoft.com/en-us/microsoft-edge/web-platform/prompt-api',
    );
    expect(body).toContain(`/docs/${sdk}/platform/ollama`);
    if (sdk === 'angular')
      expect(visible).toContain('<app-local-models></app-local-models>');
  },
);
