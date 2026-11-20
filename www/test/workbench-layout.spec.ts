import { expect, test, vi } from 'vitest';
import {
  clampWorkbenchSplit,
  createWorkbenchLayoutStore,
  parseWorkbenchLayout,
  stepWorkbenchSplit,
  workbenchExpandSection,
  workbenchLayoutDefaults,
  workbenchLayoutKey,
  workbenchLegacyLayoutKey,
} from '../examples/quickstart/runtime/workbench-layout';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

test('clamps and steps the split', () => {
  const clamped = [10, 90, NaN].map(clampWorkbenchSplit);

  const stepped = [
    stepWorkbenchSplit(44, 'ArrowRight'),
    stepWorkbenchSplit(74, 'ArrowRight'),
    stepWorkbenchSplit(60, 'Home'),
    stepWorkbenchSplit(44, 'Enter'),
  ];

  expect(clamped).toEqual([25, 75, 44]);
  expect(stepped).toEqual([48, 75, 44, null]);
});

test('parses stored layouts defensively', () => {
  const empty = parseWorkbenchLayout(null);
  const broken = parseWorkbenchLayout('not json');

  const parsed = parseWorkbenchLayout(
    '{"rail":true,"collapsed":["recipes","bogus","recipes"],"split":999}',
  );

  expect(empty).toEqual(workbenchLayoutDefaults);
  expect(broken).toEqual(workbenchLayoutDefaults);
  expect(parsed).toEqual({ rail: true, collapsed: ['recipes'], split: 75 });
});

test('persists patches and notifies subscribers', () => {
  const storage = fakeStorage();
  const store = createWorkbenchLayoutStore(storage);
  const listener = vi.fn();
  store.subscribe(listener);

  store.set({ rail: false });

  expect(store.get().rail).toBe(false);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(JSON.parse(storage.map.get(workbenchLayoutKey) as string).rail).toBe(
    false,
  );
  expect(createWorkbenchLayoutStore(storage).get().rail).toBe(false);
});

test('updates memory without writing storage when persist is false', () => {
  const storage = fakeStorage();
  const store = createWorkbenchLayoutStore(storage);
  const listener = vi.fn();
  store.subscribe(listener);

  store.set({ split: 60 }, { persist: false });

  expect(store.get().split).toBe(60);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(storage.map.has(workbenchLayoutKey)).toBe(false);
});

test('stops notifying a listener after it unsubscribes', () => {
  const store = createWorkbenchLayoutStore(fakeStorage());
  const listener = vi.fn();
  const unsubscribe = store.subscribe(listener);

  unsubscribe();
  store.set({ rail: false });

  expect(listener).not.toHaveBeenCalled();
});

test('survives storage that throws', () => {
  const storage = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  const store = createWorkbenchLayoutStore(storage);

  const initial = store.get();
  expect(() => store.set({ split: 60 })).not.toThrow();

  expect(initial).toEqual(workbenchLayoutDefaults);
  expect(store.get().split).toBe(60);
});

const lessonSections = ['start', 'concepts', 'production', 'recipes'];

test('a new reader starts in rail mode with lesson sections collapsed', () => {
  const store = createWorkbenchLayoutStore(fakeStorage());

  const layout = store.get();

  expect(layout).toEqual({ rail: true, collapsed: lessonSections, split: 44 });
  expect(workbenchLayoutKey).toBe('hashbrown.workbench.layout.v2');
});

test('a legacy layout keeps its split but takes the new rail default', () => {
  const storage = fakeStorage();
  storage.map.set(
    workbenchLegacyLayoutKey,
    '{"rail":false,"collapsed":[],"split":60}',
  );

  const store = createWorkbenchLayoutStore(storage);

  expect(workbenchLegacyLayoutKey).toBe('hashbrown.workbench.layout');
  expect(store.get()).toEqual({
    rail: true,
    collapsed: lessonSections,
    split: 60,
  });
  expect(storage.map.has(workbenchLayoutKey)).toBe(false);

  store.set({ split: 50 });

  expect(JSON.parse(storage.map.get(workbenchLayoutKey) as string)).toEqual({
    rail: true,
    collapsed: lessonSections,
    split: 50,
  });
});

test('a saved v2 choice wins over the defaults', () => {
  const storage = fakeStorage();
  storage.map.set(
    workbenchLayoutKey,
    '{"rail":false,"collapsed":["recipes"],"split":30}',
  );
  storage.map.set(workbenchLegacyLayoutKey, '{"split":70}');

  const store = createWorkbenchLayoutStore(storage);

  expect(store.get()).toEqual({
    rail: false,
    collapsed: ['recipes'],
    split: 30,
  });
});

test('expanding a section removes only that section', () => {
  const layout = workbenchLayoutDefaults;

  const expanded = workbenchExpandSection(layout, 'concepts');

  expect(expanded).toEqual({
    ...layout,
    collapsed: ['start', 'production', 'recipes'],
  });
  expect(layout.collapsed).toEqual(lessonSections);
});
