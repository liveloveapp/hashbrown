import { expect, test } from 'vitest';
import {
  workbenchInspectorTabs,
  workbenchTabLayout,
} from '../examples/quickstart/runtime/workbench-tab-rule';
import { workbenchLessons } from '../examples/quickstart/runtime/workbench-lessons';

const rows: readonly [string, string[], string[]][] = [
  ['generative-ui', ['UI', 'Requests', 'State'], ['JSON']],
  ['tools', ['Requests', 'State'], ['JSON', 'UI']],
  [
    'javascript-runtime',
    ['Runtime', 'Code', 'Requests', 'State'],
    ['Text', 'UI'],
  ],
  ['ui-kits', ['UI', 'Kit', 'Requests', 'State'], ['JSON', 'Schema']],
  [
    'activities',
    ['Activities', 'Interrupts', 'Requests', 'State'],
    ['Text', 'UI'],
  ],
  [
    'server-threads',
    ['Server', 'History', 'Requests', 'State'],
    ['Text', 'Access', 'UI'],
  ],
  ['decisions', ['JSON', 'Requests', 'State'], ['UI']],
  [
    'natural-forms',
    ['Form', 'Requests', 'State'],
    ['JSON', 'History', 'Parser', 'Schema', 'UI'],
  ],
  [
    'shared-state',
    ['State', 'Requests'],
    ['Text', 'UI', 'Activities', 'Interrupts'],
  ],
];

const byId = (id: string) =>
  workbenchLessons.find((lesson) => lesson.id === id)!;

test.each(rows)('%s lays out its tabs', (id, bar, more) => {
  const lesson = byId(id);

  const layout = workbenchTabLayout(lesson, workbenchInspectorTabs(lesson));

  expect(layout).toEqual({ bar, more });
});

test('every lesson shows at most four tabs in the bar', () => {
  const layouts = workbenchLessons.map((lesson) =>
    workbenchTabLayout(lesson, workbenchInspectorTabs(lesson)),
  );

  expect(layouts.every((layout) => layout.bar.length <= 4)).toBe(true);
});

test('every lesson keeps every tab it had', () => {
  const results = workbenchLessons.map((lesson) => {
    const tabs = workbenchInspectorTabs(lesson);
    const layout = workbenchTabLayout(lesson, tabs);
    return {
      tabs: [...tabs].sort(),
      shown: [...layout.bar, ...layout.more].sort(),
    };
  });

  expect(results.every((r) => r.tabs.join() === r.shown.join())).toBe(true);
});

test('no lesson means the default tab list', () => {
  const tabs = workbenchInspectorTabs(undefined);

  expect(tabs).toEqual(['JSON', 'Requests', 'UI', 'State']);
});
