import { createAtcStore, type MapFilter } from '@atc/shared';
import { fakeFilterTransport } from '@atc/shared/testing';
import { TestBed } from '@angular/core/testing';
import { provideHashbrown } from '@hashbrownai/angular';
import { expect, test } from 'vitest';
import { injectMapFilter } from './filter';
import { ATC_STORE } from './store';

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
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHashbrown({ baseUrl: '/unused' }),
      { provide: ATC_STORE, useValue: store },
    ],
  });
  const filter = TestBed.runInInjectionContext(() =>
    injectMapFilter({ transport: model.transport }),
  );

  return { store, model, filter };
}

async function until(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    TestBed.tick();
    if (check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('condition not met');
}

function lastUserMessage(request: { input: { messages: unknown[] } }) {
  const user = request.input.messages.filter(
    (message) => (message as { role: string }).role === 'user',
  );

  return (user.at(-1) as { content: string }).content;
}

test('apply streams into store.setMapFilter as fields complete', async () => {
  const { store, model, filter } = setup();

  filter.apply('Alaska jets');
  await until(() => model.requests.length === 1);
  model.push('{"airline":"Alaska","typeCode":null,');
  await until(() => store.getState().mapFilter?.filter.airline === 'Alaska');
  const early = store.getState().mapFilter?.filter.kind;
  model.push('"kind":"jet","minAltitudeFt":null,');
  await until(() => store.getState().mapFilter?.filter.kind === 'jet');

  expect(early).toBeNull();
  expect(store.getState().mapFilter?.filter.airline).toBe('Alaska');
});

test('apply sends the current filter for refinement', async () => {
  const { store, model, filter } = setup();
  const current = filterOf({ airline: 'Alaska' });
  store.setMapFilter(current);

  filter.apply('only 737s');
  await until(() => model.requests.length === 1);

  expect(JSON.parse(lastUserMessage(model.requests[0]))).toEqual({
    request: 'only 737s',
    current,
  });
});

test('clearing the filter mid-stream is not re-applied by the rest of the answer', async () => {
  const { store, model, filter } = setup();
  filter.apply('Alaska jets');
  await until(() => model.requests.length === 1);
  model.push('{"airline":"Alaska","typeCode":null,');
  await until(() => store.getState().mapFilter !== null);

  store.clearMapFilter();
  model.push('"kind":"jet","minAltitudeFt":null,');
  model.finish();
  await new Promise((resolve) => setTimeout(resolve, 50));
  TestBed.tick();

  expect(store.getState().mapFilter).toBeNull();
  expect(filter.streaming().size).toBe(0);
});

test('the same words sent again after a clear ask the model again', async () => {
  const { store, model, filter } = setup();
  filter.apply('Alaska');
  await until(() => model.requests.length === 1);
  model.push('{"airline":"Alaska",');
  await until(() => store.getState().mapFilter !== null);
  store.clearMapFilter();

  filter.apply('Alaska');
  await until(() => model.requests.length === 2);
  model.push('{"airline":"Alaska",');

  await until(() => store.getState().mapFilter?.filter.airline === 'Alaska');
  expect(model.requests).toHaveLength(2);
});

test('a refinement keeps the current clauses until the answer decides them', async () => {
  const { store, model, filter } = setup();
  store.setMapFilter(filterOf({ airline: 'Alaska' }));

  filter.apply('only jets');
  await until(() => model.requests.length === 1);
  model.push('{"kind":"jet",');
  await until(() => store.getState().mapFilter?.filter.kind === 'jet');
  const kept = store.getState().mapFilter?.filter.airline;
  model.push('"airline":null,');
  await until(() => store.getState().mapFilter?.filter.airline === null);

  expect(kept).toBe('Alaska');
});

test('a second apply mid-stream supersedes the first', async () => {
  const { store, model, filter } = setup();
  filter.apply('Alaska');
  await until(() => model.requests.length === 1);
  model.push('{"airline":"Alaska",');
  await until(() => store.getState().mapFilter !== null);

  filter.apply('Delta');
  await until(() => model.requests.length === 2);
  model.push('{"airline":"Delta",');

  await until(() => store.getState().mapFilter?.filter.airline === 'Delta');
});

test('clearing before the first field arrives still cancels the run', async () => {
  const { store, model, filter } = setup();
  store.setMapFilter(filterOf({ airline: 'Alaska' }));
  filter.apply('only jets');
  await until(() => model.requests.length === 1);

  store.clearMapFilter();
  model.push('{"kind":"jet",');
  await new Promise((resolve) => setTimeout(resolve, 50));
  TestBed.tick();

  expect(store.getState().mapFilter).toBeNull();
});
