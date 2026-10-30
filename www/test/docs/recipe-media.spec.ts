import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { DOCS_DEMOS } from '../../src/components/elements/docs-demo-media';

test.each(
  [
    'ui',
    'tools',
    'structured',
    'streaming',
    'schemas',
    'decisions',
    'debugging',
    'request-transformation',
    'magic-text',
    'predictions',
    'ui-selection',
    'first-plan',
    'conversation',
    'system-instructions',
    'shared-state',
    'activities',
    'interrupts',
    'message-history',
    'save-text-conversations',
    'server-threads',
    'public-endpoint',
    'agent-decisions',
    'json-parser',
    'natural-forms',
    'ui-kits',
    'ui-chatbot',
  ].flatMap((lesson) =>
    ['react', 'angular'].map(
      (framework) => `canonical-workbench-${lesson}-${framework}`,
    ),
  ),
)('%s has accessible recorded media and a result screenshot', (id) => {
  const root = resolve(import.meta.dirname, '../../public/video/docs');
  const suffixes = [
    '.mp4',
    '.webm',
    '-poster.png',
    '.vtt',
    '-transcript.txt',
    '-result.png',
  ];

  const missing = suffixes.filter(
    (suffix) => !existsSync(resolve(root, id + suffix)),
  );

  expect(id in DOCS_DEMOS).toBe(true);
  expect(missing).toEqual([]);
  expect(readFileSync(resolve(root, `${id}.vtt`), 'utf8')).toMatch(/^WEBVTT/);
});
