// @vitest-environment jsdom
import { expect, test } from 'vitest';
import {
  workbenchLessonGroups,
  workbenchLessons,
} from '../examples/quickstart/runtime/workbench-lessons';
import {
  workbenchIcon,
  workbenchLessonIcons,
} from '../examples/quickstart/runtime/workbench-icons';

test('groups every lesson exactly once in sidebar order', () => {
  const groups = workbenchLessonGroups.map((g) => [g.id, g.title, g.lessons]);

  const flattened = workbenchLessonGroups.flatMap((g) => g.lessons).sort();

  expect(groups).toEqual([
    [
      'start',
      'Get started',
      ['first-plan', 'conversation', 'system-instructions'],
    ],
    [
      'concepts',
      'Concepts',
      [
        'generative-ui',
        'tools',
        'structured-output',
        'streaming',
        'schemas',
        'decisions',
      ],
    ],
    ['production', 'Production', ['debugging', 'request-transformation']],
    ['recipes', 'Recipes', ['magic-text', 'predictions', 'ui-selection']],
  ]);
  expect(flattened).toEqual(workbenchLessons.map((l) => l.id).sort());
});

test('gives every lesson an icon', () => {
  for (const lesson of workbenchLessons) {
    expect(workbenchLessonIcons[lesson.id]).toBeDefined();
  }
});

test('renders decorative inline SVG icons', () => {
  const icon = workbenchIcon('play');

  expect(icon.tagName).toBe('svg');
  expect(icon.getAttribute('aria-hidden')).toBe('true');
  expect(icon.getAttribute('focusable')).toBe('false');
  expect(icon.getAttribute('viewBox')).toBe('0 0 24 24');
  expect(icon.getAttribute('class')).toBe('wb-icon');
  expect(icon.childNodes.length).toBeGreaterThan(0);
});
