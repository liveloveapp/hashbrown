import { expect, test, vi } from 'vitest';
import { createFilterSync, filterRequestInput } from './filter-sync';
import type { MapFilter } from './find-aircraft';
import { createAtcStore } from './store';

function filterOf(overrides: Partial<MapFilter> = {}): MapFilter {
  return {
    airline: null,
    typeCode: null,
    kind: null,
    minAltitudeFt: null,
    maxAltitudeFt: null,
    approaching: null,
    near: null,
    inAirspace: null,
    ...overrides,
  };
}

test('the request input is the JSON the server pins, with the current filter or null', () => {
  const current = filterOf({ airline: 'Alaska' });

  const refined = JSON.parse(filterRequestInput('only 737s', current));
  const fresh = JSON.parse(filterRequestInput('Alaska', null));

  expect(refined).toEqual({ request: 'only 737s', current });
  expect(fresh).toEqual({ request: 'Alaska', current: null });
});

test('updates apply the complete fields to the store and report the pending ones', () => {
  const store = createAtcStore();
  const sync = createFilterSync(store, () => undefined);
  sync.begin();

  const streaming = sync.update({
    airline: 'Alaska',
    near: { airport: 'KSE' },
  });

  expect(store.getState().mapFilter?.filter.airline).toBe('Alaska');
  expect(store.getState().mapFilter?.filter.near).toBeNull();
  expect([...streaming]).toEqual(['near']);
});

test('an identical update does not touch the store again', () => {
  const store = createAtcStore();
  const sync = createFilterSync(store, () => undefined);
  const listener = vi.fn();
  sync.begin();
  sync.update({ airline: 'Alaska' });
  store.subscribe(listener);

  sync.update({ airline: 'Alaska' });

  expect(listener).not.toHaveBeenCalled();
});

test('nothing applies before a run begins, or when no field is decided yet', () => {
  const store = createAtcStore();
  const sync = createFilterSync(store, () => undefined);

  sync.update({ airline: 'Alaska' });
  sync.begin();
  sync.update({});

  expect(store.getState().mapFilter).toBeNull();
});

test('clearing the filter during a run cancels it and ignores later output', () => {
  const store = createAtcStore();
  const onCancel = vi.fn();
  const sync = createFilterSync(store, onCancel);
  sync.begin();
  sync.update({ airline: 'Alaska' });

  store.clearMapFilter();
  const streaming = sync.update({ airline: 'Alaska', kind: 'jet' });

  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(store.getState().mapFilter).toBeNull();
  expect(streaming.size).toBe(0);
});

test('a new run supersedes the one in flight', () => {
  const store = createAtcStore();
  const sync = createFilterSync(store, () => undefined);
  sync.begin();
  sync.update({ airline: 'Alaska' });

  sync.begin();
  sync.update({ airline: 'Delta' });

  expect(store.getState().mapFilter?.filter.airline).toBe('Delta');
});

test('disposing stops listening to the store', () => {
  const store = createAtcStore();
  const onCancel = vi.fn();
  const sync = createFilterSync(store, onCancel);
  sync.begin();
  sync.update({ airline: 'Alaska' });

  sync.dispose();
  store.clearMapFilter();

  expect(onCancel).not.toHaveBeenCalled();
});
