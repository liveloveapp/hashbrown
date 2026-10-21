import { createAtcStore, type MapFilter } from '@atc/shared';
import { fakeFilterTransport } from '@atc/shared/testing';
import { HashbrownProvider } from '@hashbrownai/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, test } from 'vitest';
import { useMapFilter } from './filter';
import { AtcStoreProvider } from './store';

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

function setup() {
  const store = createAtcStore();
  const model = fakeFilterTransport();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <HashbrownProvider url="/unused">
      <AtcStoreProvider store={store}>{children}</AtcStoreProvider>
    </HashbrownProvider>
  );
  const hook = renderHook(() => useMapFilter({ transport: model.transport }), {
    wrapper,
  });

  return { store, model, hook };
}

function lastUserMessage(request: { input: { messages: unknown[] } }) {
  const user = request.input.messages.filter(
    (message) => (message as { role: string }).role === 'user',
  );

  return (user.at(-1) as { content: string }).content;
}

test('apply streams into store.setMapFilter as fields complete', async () => {
  const { store, model, hook } = setup();

  act(() => hook.result.current.apply('Alaska jets'));
  await waitFor(() => expect(model.requests).toHaveLength(1));
  act(() => model.push('{"airline":"Alaska","typeCode":null,'));
  await waitFor(() =>
    expect(store.getState().mapFilter?.filter.airline).toBe('Alaska'),
  );
  const early = store.getState().mapFilter?.filter.kind;
  act(() => model.push('"kind":"jet","minAltitudeFt":null,'));
  await waitFor(() =>
    expect(store.getState().mapFilter?.filter.kind).toBe('jet'),
  );

  expect(early).toBeNull();
  expect(store.getState().mapFilter?.filter.airline).toBe('Alaska');
});

test('apply sends the current filter for refinement', async () => {
  const { store, model, hook } = setup();
  const current = filterOf({ airline: 'Alaska' });
  act(() => store.setMapFilter(current));

  act(() => hook.result.current.apply('only 737s'));
  await waitFor(() => expect(model.requests).toHaveLength(1));

  expect(JSON.parse(lastUserMessage(model.requests[0]))).toEqual({
    request: 'only 737s',
    current,
  });
});

test('clearing the filter mid-stream is not re-applied by the rest of the answer', async () => {
  const { store, model, hook } = setup();
  act(() => hook.result.current.apply('Alaska jets'));
  await waitFor(() => expect(model.requests).toHaveLength(1));
  act(() => model.push('{"airline":"Alaska","typeCode":null,'));
  await waitFor(() => expect(store.getState().mapFilter).not.toBeNull());

  act(() => store.clearMapFilter());
  act(() => model.push('"kind":"jet","minAltitudeFt":null,'));
  act(() => model.finish());
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(store.getState().mapFilter).toBeNull();
  expect(hook.result.current.streaming.size).toBe(0);
});

test('the same words sent again after a clear ask the model again', async () => {
  const { store, model, hook } = setup();
  act(() => hook.result.current.apply('Alaska'));
  await waitFor(() => expect(model.requests).toHaveLength(1));
  act(() => model.push('{"airline":"Alaska",'));
  await waitFor(() => expect(store.getState().mapFilter).not.toBeNull());
  act(() => store.clearMapFilter());

  act(() => hook.result.current.apply('Alaska'));
  await waitFor(() => expect(model.requests).toHaveLength(2));
  act(() => model.push('{"airline":"Alaska",'));

  await waitFor(() =>
    expect(store.getState().mapFilter?.filter.airline).toBe('Alaska'),
  );
  expect(model.requests).toHaveLength(2);
});

test('a refinement keeps the current clauses until the answer decides them', async () => {
  const { store, model, hook } = setup();
  act(() => store.setMapFilter(filterOf({ airline: 'Alaska' })));

  act(() => hook.result.current.apply('only jets'));
  await waitFor(() => expect(model.requests).toHaveLength(1));
  act(() => model.push('{"kind":"jet",'));
  await waitFor(() =>
    expect(store.getState().mapFilter?.filter.kind).toBe('jet'),
  );
  const kept = store.getState().mapFilter?.filter.airline;
  act(() => model.push('"airline":null,'));
  await waitFor(() =>
    expect(store.getState().mapFilter?.filter.airline).toBeNull(),
  );

  expect(kept).toBe('Alaska');
});

test('a second apply mid-stream supersedes the first', async () => {
  const { store, model, hook } = setup();
  act(() => hook.result.current.apply('Alaska'));
  await waitFor(() => expect(model.requests).toHaveLength(1));
  act(() => model.push('{"airline":"Alaska",'));
  await waitFor(() => expect(store.getState().mapFilter).not.toBeNull());

  act(() => hook.result.current.apply('Delta'));
  await waitFor(() => expect(model.requests).toHaveLength(2));
  act(() => model.push('{"airline":"Delta",'));

  await waitFor(() =>
    expect(store.getState().mapFilter?.filter.airline).toBe('Delta'),
  );
});

test('clearing before the first field arrives still cancels the run', async () => {
  const { store, model, hook } = setup();
  act(() => store.setMapFilter(filterOf({ airline: 'Alaska' })));
  act(() => hook.result.current.apply('only jets'));
  await waitFor(() => expect(model.requests).toHaveLength(1));

  act(() => store.clearMapFilter());
  act(() => model.push('{"kind":"jet",'));
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(store.getState().mapFilter).toBeNull();
});

test('the last chunk of a superseded run never lands, and the new run still applies', async () => {
  const { store, model, hook } = setup();
  act(() => hook.result.current.apply('Alaska'));
  await waitFor(() => expect(model.requests).toHaveLength(1));
  act(() => model.push('{"airline":"Alaska",'));
  await waitFor(() => expect(store.getState().mapFilter).not.toBeNull());

  await act(async () => {
    hook.result.current.apply('Delta');
    model.push('"kind":"jet"}');
    model.finish();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await waitFor(() => expect(model.requests).toHaveLength(2));
  const kindAfterOldRun = store.getState().mapFilter?.filter.kind;
  act(() => model.push('{"airline":"Delta","kind":null}'));
  act(() => model.finish());

  await waitFor(() =>
    expect(store.getState().mapFilter?.filter.airline).toBe('Delta'),
  );
  expect(kindAfterOldRun).toBeNull();
});
