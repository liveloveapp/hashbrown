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
import { workbenchSidebarScrollDelta } from '../examples/quickstart/runtime/workbench-sidebar';

test('reveals a clipped current lesson while keeping the focused heading visible', () => {
  const viewport = { top: 64, bottom: 898 };
  const lesson = { top: 930, bottom: 962 };
  const focused = { top: 330, bottom: 365 };

  const delta = workbenchSidebarScrollDelta(viewport, lesson, focused);

  expect(delta).toBe(64);
});

test('keeps sidebar keyboard focus visible when both controls cannot fit', () => {
  const viewport = { top: 64, bottom: 898 };
  const lesson = { top: 1300, bottom: 1332 };
  const focused = { top: 70, bottom: 105 };

  const delta = workbenchSidebarScrollDelta(viewport, lesson, focused);

  expect(delta).toBe(0);
});

test('reveals a current lesson above the viewport and leaves hidden groups alone', () => {
  const viewport = { top: 64, bottom: 898 };

  const above = workbenchSidebarScrollDelta(viewport, { top: 20, bottom: 52 });
  const hidden = workbenchSidebarScrollDelta(viewport, { top: 0, bottom: 0 });

  expect(above).toBe(-44);
  expect(hidden).toBe(0);
});

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
        'javascript-runtime',
        'structured-output',
        'streaming',
        'schemas',
        'decisions',
        'shared-state',
        'activities',
        'interrupts',
        'message-history',
      ],
    ],
    [
      'production',
      'Production',
      [
        'production-recovery',
        'local-models',
        'debugging',
        'request-transformation',
        'save-text-conversations',
        'server-threads',
        'public-endpoint',
      ],
    ],
    [
      'recipes',
      'Recipes',
      [
        'prose',
        'predictions',
        'ui-selection',
        'ui-kits',
        'ui-chatbot',
        'agent-decisions',
        'json-parser',
        'natural-forms',
      ],
    ],
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
