import { expect, test } from 'vitest';
import {
  applicationFences,
  conceptModules,
  mergeExampleModules,
  recipeModules,
} from '../../src/tools/check-docs-examples';

const boundary = '\n## Explore it in the workbench\n';

test('extracts actual application code and excludes captured workbench excerpts', () => {
  const document =
    '```ts\nimport { s } from "@hashbrownai/core";\n```\n' +
    boundary +
    '```ts\nconst captured = true;\n```';
  expect(applicationFences(document)).toEqual([
    {
      language: 'ts',
      source: 'import { s } from "@hashbrownai/core";',
      index: 0,
    },
  ]);
});

test('recipe helper names preserve adjacent imports and intentional fence counts', () => {
  const document =
    '```tsx\nimport { reviewTrip } from "./review-trip";\n```\n' +
    '```ts\nexport function reviewTrip() {}\n```\n' +
    boundary;
  const modules = recipeModules(document, 'react', 'trip', [
    'trip-draft',
    'review-trip',
  ]);
  expect(modules.map((module) => module.name)).toEqual([
    'react/trip/trip-draft.tsx',
    'react/trip/review-trip.ts',
  ]);
  expect(() =>
    recipeModules(document, 'react', 'trip', ['trip-draft']),
  ).toThrow('expected 1 application snippets, found 2');
  expect(() =>
    recipeModules('```ts\nconst value = 1;\n```', 'react', 'trip', []),
  ).toThrow('missing workbench boundary');
});

test('concept extraction keeps imported modules and shared instruction constants', () => {
  const document =
    '```ts\nconst fragment = 1;\n```\n' +
    '```ts\nexport const supportInstructions = "Help customers";\n```\n' +
    '```tsx\nimport { useChat } from "@hashbrownai/react";\n```\n' +
    boundary;
  expect(
    conceptModules(document, 'react', 'concept', 'conversation').map(
      (module) => module.name,
    ),
  ).toEqual(['support-instructions.ts', 'react-concept-conversation-2.tsx']);
});

test('shared modules must agree across guides and retain source provenance', () => {
  const first = {
    name: 'support-instructions.ts',
    source: 'same',
    origins: ['angular.md'],
  };
  expect(
    mergeExampleModules([first, { ...first, origins: ['react.md'] }]),
  ).toEqual([{ ...first, origins: ['angular.md', 'react.md'] }]);
  expect(() =>
    mergeExampleModules([first, { ...first, source: 'different' }]),
  ).toThrow('Divergent shared module');
  expect(() => applicationFences(boundary + boundary)).toThrow(
    'at most one workbench boundary',
  );
});
