import { expectConceptFirstWorkbench } from './concept-first-workbench';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { DOCS_DEMOS } from '../../src/components/elements/docs-demo-media';
import { readDoc, SDKS } from '../../src/lib/content';

const guides = [
  ['structured-form', ['concept', 'structured-output']],
  ['streaming-data', ['concept', 'streaming']],
  ['structured-form', ['recipes', 'natural-language-to-structured-data']],
] as const;

test.each(['structured-form', 'streaming-data'])(
  '%s has accessible, locally hosted recording assets',
  (id) => {
    const root = resolve(import.meta.dirname, '../../public/video/docs');
    const suffixes = [
      '.mp4',
      '.webm',
      '-poster.png',
      '.vtt',
      '-transcript.txt',
    ];

    const missing = suffixes.filter(
      (suffix) => !existsSync(resolve(root, id + suffix)),
    );

    expect(id in DOCS_DEMOS).toBe(true);
    expect(missing).toEqual([]);
    expect(readFileSync(resolve(root, `${id}.vtt`), 'utf8')).toMatch(/^WEBVTT/);
  },
);

test.each(SDKS)(
  '%s typed-data guides lead with their own recorded behavior',
  (sdk) => {
    const pages = guides.map(([demo, slug]) => ({
      demo:
        slug[1] === 'structured-output'
          ? 'structured-output'
          : slug[1] === 'streaming'
            ? 'streaming'
            : slug[1] === 'natural-language-to-structured-data'
              ? 'natural-forms'
              : demo,
      body: readDoc(sdk, slug)?.body ?? '',
    }));

    for (const { demo, body } of pages) {
      expectConceptFirstWorkbench(body, sdk, demo);
    }
  },
);

test.each(SDKS)(
  '%s schema-to-form learning links resolve within the selected SDK',
  (sdk) => {
    const path = `/docs/${sdk}/`;
    const transitions = [
      [['concept', 'schema'], 'concept/structured-output'],
      [['concept', 'structured-output'], 'concept/streaming'],
      [['concept', 'streaming'], 'recipes/natural-language-to-structured-data'],
      [
        ['recipes', 'natural-language-to-structured-data'],
        'concept/components',
      ],
    ] as const;

    for (const [slug, next] of transitions) {
      const body = readDoc(sdk, slug)?.body ?? '';

      expect(body).toContain(`(${path}${next})`);
      expect(readDoc(sdk, next.split('/'))).toBeDefined();
    }
  },
);
