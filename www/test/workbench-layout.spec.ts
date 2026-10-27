import { expect, test, vi } from 'vitest';
import {
  clampWorkbenchSplit,
  createWorkbenchLayoutStore,
  parseWorkbenchLayout,
  stepWorkbenchSplit,
  workbenchLayoutDefaults,
  workbenchLayoutKey,
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

  store.set({ rail: true });

  expect(store.get().rail).toBe(true);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(JSON.parse(storage.map.get(workbenchLayoutKey) as string).rail).toBe(
    true,
  );
  expect(createWorkbenchLayoutStore(storage).get().rail).toBe(true);
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
