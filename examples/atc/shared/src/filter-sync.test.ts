import { expect, test, vi } from 'vitest';
import {
  createFilterSync,
  filterRequestInput,
  streamingKeys,
} from './filter-sync';
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
  sync.begin(null);

  const partial = { airline: 'Alaska', near: { airport: 'KSE' } };
  sync.update(partial);
  const streaming = streamingKeys(partial);

  expect(store.getState().mapFilter?.filter.airline).toBe('Alaska');
  expect(store.getState().mapFilter?.filter.near).toBeNull();
  expect([...streaming]).toEqual(['near']);
});

test('an identical update does not touch the store again', () => {
  const store = createAtcStore();
  const sync = createFilterSync(store, () => undefined);
  const listener = vi.fn();
  sync.begin(null);
  sync.update({ airline: 'Alaska' });
  store.subscribe(listener);

  sync.update({ airline: 'Alaska' });

  expect(listener).not.toHaveBeenCalled();
});

test('nothing applies before a run begins, or when no field is decided yet', () => {
  const store = createAtcStore();
  const sync = createFilterSync(store, () => undefined);

  sync.update({ airline: 'Alaska' });
  sync.begin(null);
  sync.update({});

  expect(store.getState().mapFilter).toBeNull();
});

test('clearing the filter during a run cancels it and ignores later output', () => {
  const store = createAtcStore();
  const onCancel = vi.fn();
  const sync = createFilterSync(store, onCancel);
  sync.begin(null);
  sync.update({ airline: 'Alaska' });

  store.clearMapFilter();
  sync.update({ airline: 'Alaska', kind: 'jet' });

  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(store.getState().mapFilter).toBeNull();
});

test('a new run supersedes the one in flight', () => {
  const store = createAtcStore();
  const sync = createFilterSync(store, () => undefined);
  sync.begin(null);
  sync.update({ airline: 'Alaska' });

  sync.begin(null);
  sync.update({ airline: 'Delta' });

  expect(store.getState().mapFilter?.filter.airline).toBe('Delta');
});

test('disposing stops listening to the store', () => {
  const store = createAtcStore();
  const onCancel = vi.fn();
  const sync = createFilterSync(store, onCancel);
  sync.begin(null);
  sync.update({ airline: 'Alaska' });

  sync.dispose();
  store.clearMapFilter();

  expect(onCancel).not.toHaveBeenCalled();
});

test('a refinement keeps the current clauses the answer has not reached yet', () => {
  const store = createAtcStore();
  const base = filterOf({ airline: 'Alaska' });
  store.setMapFilter(base);
  const sync = createFilterSync(store, () => undefined);
  sync.begin(base);

  sync.update({ kind: 'jet' });

  expect(store.getState().mapFilter?.filter).toEqual(
    filterOf({ airline: 'Alaska', kind: 'jet' }),
  );
});

test('an explicit null in the answer removes a current clause', () => {
  const store = createAtcStore();
  const base = filterOf({ airline: 'Alaska' });
  store.setMapFilter(base);
  const sync = createFilterSync(store, () => undefined);
  sync.begin(base);

  sync.update({ airline: null });

  expect(store.getState().mapFilter?.filter.airline).toBeNull();
});

test('finishing applies the whole answer, so absent clauses are dropped', () => {
  const store = createAtcStore();
  const base = filterOf({ airline: 'Alaska' });
  store.setMapFilter(base);
  const sync = createFilterSync(store, () => undefined);
  sync.begin(base);
  sync.update({ kind: 'jet' });

  sync.finish({ kind: 'jet' });

  expect(store.getState().mapFilter?.filter).toEqual(filterOf({ kind: 'jet' }));
});

test('clearing before the first update cancels the run and nothing is applied', () => {
  const store = createAtcStore();
  const base = filterOf({ airline: 'Alaska' });
  store.setMapFilter(base);
  const onCancel = vi.fn();
  const sync = createFilterSync(store, onCancel);
  sync.begin(base);

  store.clearMapFilter();
  sync.update({ kind: 'jet' });

  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(store.getState().mapFilter).toBeNull();
});

test('store changes that leave a filter on the map do not cancel', () => {
  const store = createAtcStore();
  const base = filterOf({ airline: 'Alaska' });
  store.setMapFilter(base);
  const onCancel = vi.fn();
  const sync = createFilterSync(store, onCancel);
  sync.begin(base);

  store.applySnapshot({ at: 1, aircraft: [] });
  sync.update({ kind: 'jet' });

  expect(onCancel).not.toHaveBeenCalled();
  expect(store.getState().mapFilter?.filter.kind).toBe('jet');
});

test('a failed run restores the filter it refined', () => {
  const store = createAtcStore();
  const base = filterOf({ airline: 'Alaska' });
  store.setMapFilter(base);
  const sync = createFilterSync(store, () => undefined);
  sync.begin(base);
  sync.update({ kind: 'jet', airline: null });

  const failed = sync.fail();
  sync.update({ kind: 'turboprop' });

  expect(failed).toBe(true);
  expect(store.getState().mapFilter?.filter).toEqual(base);
});

test('a failed fresh run clears what it half-applied', () => {
  const store = createAtcStore();
  const sync = createFilterSync(store, () => undefined);
  sync.begin(null);
  sync.update({ airline: 'Alaska' });

  const failed = sync.fail();

  expect(failed).toBe(true);
  expect(store.getState().mapFilter).toBeNull();
});

test('a failure after the run was cancelled or finished changes nothing', () => {
  const store = createAtcStore();
  const sync = createFilterSync(store, () => undefined);
  sync.begin(null);
  sync.update({ airline: 'Alaska' });
  sync.finish({ airline: 'Alaska' });

  const failed = sync.fail();

  expect(failed).toBe(false);
  expect(store.getState().mapFilter?.filter.airline).toBe('Alaska');
});
