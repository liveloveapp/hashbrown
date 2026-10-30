import { expectConceptFirstWorkbench } from './concept-first-workbench';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { readDoc, SDKS } from '../../src/lib/content';
import { DOCS_DEMOS } from '../../src/components/elements/docs-demo-media';

const guides = [
  ['public-endpoint', ['recipes', 'public-endpoint']],
  ['server-threads', ['recipes', 'threads']],
  ['javascript-runtime', ['concept', 'runtime']],
] as const;

test.each(guides)(
  'production guide media %s has complete accessible local assets',
  (id) => {
    const root = resolve(import.meta.dirname, '../../public/video/docs');

    const files = [
      '.mp4',
      '.webm',
      '-poster.png',
      '.vtt',
      '-transcript.txt',
    ].map((suffix) => `${id}${suffix}`);

    expect(id in DOCS_DEMOS).toBe(true);
    expect(files.filter((file) => existsSync(resolve(root, file)))).toEqual(
      files,
    );
    expect(readFileSync(resolve(root, `${id}.vtt`), 'utf8')).toMatch(/^WEBVTT/);
  },
);

test.each(SDKS)(
  '%s production guides begin with the behavior they demonstrate',
  (sdk) => {
    const pages = guides.map(([demo, slug]) => ({
      demo,
      body: readDoc(sdk, slug)?.body ?? '',
    }));

    for (const { demo, body } of pages) {
      expectConceptFirstWorkbench(body, sdk, demo);
    }
  },
);

test.each(SDKS)(
  '%s production guides publish the checked endpoint and thread files',
  (sdk) => {
    const thread = readDoc(sdk, ['recipes', 'threads'])?.body ?? '';
    const endpoint = readDoc(sdk, ['recipes', 'public-endpoint'])?.body ?? '';
    const files = [
      ['server/thread-app.ts', endpoint],
      ['server/thread-server.ts', endpoint],
      ['server/thread-store.ts', thread],
      [
        sdk === 'react'
          ? 'react/src/ServerWorkbench.tsx'
          : 'angular/src/app/server-workbench.ts',
        thread,
      ],
      ['runtime/workbench-server-history.ts', thread],
    ];

    for (const [file, body] of files) {
      expect(body, file).toContain(
        `https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/${file}`,
      );
      expect(
        existsSync(
          resolve(import.meta.dirname, '../../examples/quickstart', file),
        ),
        file,
      ).toBe(true);
    }
  },
);
