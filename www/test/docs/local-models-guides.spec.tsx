import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { readDoc, SDKS } from '../../src/lib/content';
import { DOCS_DEMOS } from '../../src/components/elements/docs-demo-media';

for (const sdk of SDKS)
  test(`${sdk} canonical local recording includes accessible native footage and source disclosures`, () => {
    const id = `canonical-workbench-local-models-${sdk}` as const;
    const media = DOCS_DEMOS[id];

    expect(media.recording).toContain('Actual native Chrome inference');
    expect(media.recording).toContain('Actual-speed footage');
    for (const suffix of [
      '.mp4',
      '.webm',
      '.vtt',
      '-poster.png',
      '-result.png',
      '-transcript.txt',
    ]) {
      expect(
        readFileSync(
          resolve(import.meta.dirname, '../../public/video/docs', id + suffix),
        ).length,
      ).toBeGreaterThan(0);
    }
  });

test.each(SDKS)(
  '%s local-model recipe leads with recorded native inference',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'local-models'])?.body ?? '';

    const demo = body.indexOf(`<hb-workbench lesson="local-models">`);

    expect(demo).toBeGreaterThan(-1);
    expect(demo).toBeLessThan(body.indexOf('\n## '));
    expect(body).toContain(
      `/video/docs/canonical-workbench-local-models-${sdk}-result.png`,
    );
    expect(body).toContain('real Chrome');
    expect(body).toContain('Prepare model');
    expect(body).toContain('Send');
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
      'two-step plan',
      'Prepare model',
      'Send',
      'Stop',
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
      expect(visible).toContain('angular/src/app/local-models-workbench.ts');
  },
);
