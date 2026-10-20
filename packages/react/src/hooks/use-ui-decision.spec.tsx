/* eslint-disable @typescript-eslint/no-explicit-any */
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import {
  componentSelectionOptions,
  createSelectionSchema,
  type Decision,
  DecisionSchemaError,
  ɵcompileDecision,
  ɵcreateUiKit,
} from '@hashbrownai/core';
import { HashbrownProvider } from '../hashbrown-provider';
import { exposeComponent } from '../expose-component.fn';
import { useUiCompletion } from './use-ui-completion';
import { useUiDecision } from './use-ui-decision';

vi.mock('./use-ui-completion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./use-ui-completion')>();
  return { ...actual, useUiCompletion: vi.fn(actual.useUiCompletion) };
});

const useUiCompletionMock = vi.mocked(useUiCompletion);
const { useUiCompletion: realUseUiCompletion } = await vi.importActual<
  typeof import('./use-ui-completion')
>('./use-ui-completion');

function withRealCompletion() {
  useUiCompletionMock.mockReset();
  useUiCompletionMock.mockImplementation(realUseUiCompletion);
}

function withFakeCompletion() {
  const setComponents = vi.fn();
  useUiCompletionMock.mockReset();
  useUiCompletionMock.mockImplementation(() => fakeCompletion(setComponents));
  return setComponents;
}

type Call = { request: Decision.Request; signal: AbortSignal };

function createFakeTransport(
  respond: (request: Decision.Request) => Decision.Response | Promise<never>,
) {
  const calls: Call[] = [];
  const transport: Decision.Transport = async (request, signal) => {
    calls.push({ request, signal });
    return respond(request);
  };
  return { calls, transport };
}

function deferredTransport() {
  const calls: Call[] = [];
  let resolve: (response: Decision.Response) => void = () => undefined;
  const transport: Decision.Transport = (request, signal) => {
    calls.push({ request, signal });
    return new Promise((r) => {
      resolve = r;
    });
  };
  return { calls, transport, resolve: (r: Decision.Response) => resolve(r) };
}

function pickResponse(
  pick: string,
  confidence: number,
  ids: string[],
): Decision.Response {
  return {
    kind: 'hashbrown.decision',
    version: 1,
    value: { pick },
    meta: {
      pick: {
        confidence,
        probabilities: Object.fromEntries(
          ids.map((id) => [id, id === pick ? confidence : 1 - confidence]),
        ),
      },
    },
  };
}

function multiResponse(
  probabilities: Record<string, number>,
): Decision.Response {
  return {
    kind: 'hashbrown.decision',
    version: 1,
    value: Object.fromEntries(
      Object.entries(probabilities).map(([id, p]) => [id, p >= 0.5]),
    ),
    meta: Object.fromEntries(
      Object.entries(probabilities).map(([id, p]) => [id, { probability: p }]),
    ),
  };
}

function wrapperFor(transport: Decision.Transport) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <HashbrownProvider decision={{ transport }}>{children}</HashbrownProvider>
    );
  };
}

function fakeCompletion(setComponents = vi.fn()) {
  return {
    pendingInterrupts: undefined,
    isResuming: false,
    resume: vi.fn(),
    stop: vi.fn(),
    state: undefined,
    setState: vi.fn(),
    output: null,
    rawOutput: null,
    ui: null,
    reload: vi.fn(),
    error: undefined,
    isLoading: false,
    isReceiving: false,
    isSending: false,
    isGenerating: false,
    isRunningToolCalls: false,
    sendingError: undefined,
    generatingError: undefined,
    exhaustedRetries: false,
    setComponents,
  } as any;
}

const candidates = [
  { id: 'flight', description: 'One aircraft', element: <p>flight</p> },
  { id: 'airport', description: 'An airport', element: <p>airport</p> },
  { id: 'weather', description: 'The weather', element: <p>weather</p> },
];

const Flight = () => null;
const Airport = () => null;
const Weather = () => null;
const flight = exposeComponent(Flight, {
  name: 'Flight',
  description: 'One aircraft',
});
const airport = exposeComponent(Airport, {
  name: 'Airport',
  description: 'An airport',
});
const weather = exposeComponent(Weather, {
  name: 'Weather',
  description: 'The weather',
});

test("useUiDecision candidates 'one' renders only the chosen element", async () => {
  withRealCompletion();
  const fake = createFakeTransport(() =>
    pickResponse('airport', 0.9, ['flight', 'airport', 'weather']),
  );

  const { result } = renderHook(
    () => useUiDecision({ input: 'show KSFO', candidates, select: 'one' }),
    { wrapper: wrapperFor(fake.transport) },
  );
  await waitFor(() => expect(result.current.ids).toEqual(['airport']));

  const { container } = render(<div>{result.current.ui}</div>);
  expect(container.textContent).toBe('airport');
  expect(result.current.decision.value).toEqual({ pick: 'airport' });
  expect(result.current.isLoading).toBe(false);
  expect(result.current.error).toBeUndefined();
  expect(fake.calls).toHaveLength(1);
});

test('useUiDecision candidates { max: 2 } renders in probability order', async () => {
  withRealCompletion();
  const fake = createFakeTransport(() =>
    multiResponse({ flight: 0.6, airport: 0.2, weather: 0.95 }),
  );

  const { result } = renderHook(
    () => useUiDecision({ input: 'storm', candidates, select: { max: 2 } }),
    { wrapper: wrapperFor(fake.transport) },
  );
  await waitFor(() => expect(result.current.ids).toHaveLength(2));

  expect(result.current.ids).toEqual(['weather', 'flight']);
  const { container } = render(<div>{result.current.ui}</div>);
  expect(container.textContent).toBe('weatherflight');
  expect(result.current.ui.map((element) => element.key)).toEqual([
    'weather',
    'flight',
  ]);
});

test('useUiDecision candidates below minConfidence renders nothing', async () => {
  withRealCompletion();
  const fake = createFakeTransport(() =>
    pickResponse('airport', 0.4, ['flight', 'airport', 'weather']),
  );

  const { result } = renderHook(
    () =>
      useUiDecision({
        input: 'hmm',
        candidates,
        select: 'one',
        minConfidence: 0.7,
      }),
    { wrapper: wrapperFor(fake.transport) },
  );
  await waitFor(() => expect(result.current.decision.value).not.toBeNull());

  expect(result.current.ids).toEqual([]);
  expect(result.current.ui).toEqual([]);
});

test('useUiDecision candidates mode keeps the UI completion idle without requests', async () => {
  withRealCompletion();
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  const fake = createFakeTransport(() =>
    pickResponse('flight', 0.9, ['flight', 'airport', 'weather']),
  );

  try {
    const { result } = renderHook(
      () => useUiDecision({ input: 'N123', candidates, select: 'one' }),
      { wrapper: wrapperFor(fake.transport) },
    );
    await waitFor(() => expect(result.current.ids).toEqual(['flight']));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  } finally {
    vi.unstubAllGlobals();
  }

  expect(fetchMock).not.toHaveBeenCalled();
  for (const [options] of useUiCompletionMock.mock.calls) {
    expect(options.input).toBeNull();
  }
});

const Note = () => null;
const Memo = () => null;
const Row = () => null;
const Table = () => null;
const note = exposeComponent(Note, { name: 'Note', description: 'A note' });
const memo = exposeComponent(Memo, { name: 'Memo', description: 'A memo' });
const row = exposeComponent(Row, { name: 'Row', description: 'A table row' });
const table = exposeComponent(Table, {
  name: 'Table',
  description: 'A table of rows',
  children: [row],
});

test('useUiDecision narrowing passes only the chosen components and waits for phase 1', async () => {
  const setComponents = withFakeCompletion();
  const kit = ɵcreateUiKit<any>({ components: [note] });
  const deferred = deferredTransport();

  const { result } = renderHook(
    () =>
      useUiDecision({
        input: 'show KSFO',
        components: [flight, kit, airport, weather],
        select: 'one',
        generate: { system: 'Render it' },
      }),
    { wrapper: wrapperFor(deferred.transport) },
  );
  await waitFor(() => expect(deferred.calls).toHaveLength(1));

  expect(result.current.isDeciding).toBe(true);
  expect(setComponents).not.toHaveBeenCalled();
  for (const [options] of useUiCompletionMock.mock.calls) {
    expect(options.input).toBeNull();
  }

  await act(async () => {
    deferred.resolve(
      pickResponse('Airport', 0.9, ['Flight', 'Note', 'Airport', 'Weather']),
    );
  });
  await waitFor(() => expect(setComponents).toHaveBeenCalled());

  expect(setComponents).toHaveBeenCalledTimes(1);
  expect(setComponents.mock.calls[0][0]).toEqual([airport]);
  expect(setComponents.mock.calls[0][0][0]).toBe(airport);
  const lastOptions = useUiCompletionMock.mock.lastCall?.[0];
  expect(lastOptions?.input).toBe('show KSFO');
  expect(lastOptions?.system).toBe('Render it');
  expect(result.current.isDeciding).toBe(false);
  expect(result.current.decisionError).toBeUndefined();
});

test('useUiDecision narrowing with a kit decides over the kit members', async () => {
  withFakeCompletion();
  const kit = ɵcreateUiKit<any>({ components: [note, table] });
  const components = [flight, kit];
  const deferred = deferredTransport();

  renderHook(
    () =>
      useUiDecision({
        input: 'show KSFO',
        components,
        select: 'one',
        generate: { system: 'Render it' },
      }),
    { wrapper: wrapperFor(deferred.transport) },
  );
  await waitFor(() => expect(deferred.calls).toHaveLength(1));

  const pick = deferred.calls[0].request.questions['pick'] as {
    options: Record<string, string | null>;
  };
  expect(Object.keys(pick.options)).toEqual(['Flight', 'Note', 'Table', 'Row']);
  expect(deferred.calls[0].request.questions).toEqual(
    ɵcompileDecision(
      createSelectionSchema(componentSelectionOptions(components), 'one'),
    ),
  );
});

test('useUiDecision narrowing passes chosen kit members with their declared children', async () => {
  const setComponents = withFakeCompletion();
  const kit = ɵcreateUiKit<any>({ components: [note, table, memo] });
  const fake = createFakeTransport(() =>
    multiResponse({ Flight: 0.1, Note: 0.2, Table: 0.9, Row: 0.1, Memo: 0.8 }),
  );

  renderHook(
    () =>
      useUiDecision({
        input: 'list the rows',
        components: [flight, kit],
        select: { max: 2 },
        generate: { system: 'Render it' },
      }),
    { wrapper: wrapperFor(fake.transport) },
  );
  await waitFor(() => expect(setComponents).toHaveBeenCalled());

  const chosen = setComponents.mock.calls[0][0];
  expect(chosen).toEqual([table, row, memo]);
  expect(chosen[0]).toBe(table);
  expect(chosen[1]).toBe(row);
  expect(useUiCompletionMock.mock.lastCall?.[0].input).toBe('list the rows');
});

test('useUiDecision narrowing with only a UI kit decides over its members', async () => {
  const setComponents = withFakeCompletion();
  const kit = ɵcreateUiKit<any>({ components: [note, memo] });
  const fake = createFakeTransport(() =>
    pickResponse('Memo', 0.9, ['Note', 'Memo']),
  );

  const { result } = renderHook(
    () =>
      useUiDecision({
        input: 'hello',
        components: [kit],
        select: 'one',
        generate: { system: 'Render it' },
      }),
    { wrapper: wrapperFor(fake.transport) },
  );
  await waitFor(() => expect(setComponents).toHaveBeenCalled());

  expect(fake.calls).toHaveLength(1);
  expect(setComponents.mock.calls[0][0]).toEqual([memo]);
  expect(result.current.decisionError).toBeUndefined();
  expect(useUiCompletionMock.mock.lastCall?.[0].input).toBe('hello');
});

test('useUiDecision narrowing with low confidence passes the original components, kit intact', async () => {
  const setComponents = withFakeCompletion();
  const kit = ɵcreateUiKit<any>({ components: [note, table] });
  const components = [flight, kit];
  const fake = createFakeTransport(() =>
    pickResponse('Table', 0.4, ['Flight', 'Note', 'Table', 'Row']),
  );

  const { result } = renderHook(
    () =>
      useUiDecision({
        input: 'something',
        components,
        select: 'one',
        minConfidence: 0.7,
        generate: { system: 'Render it' },
      }),
    { wrapper: wrapperFor(fake.transport) },
  );
  await waitFor(() => expect(setComponents).toHaveBeenCalled());

  const passed = setComponents.mock.calls[0][0];
  expect(passed).toEqual(components);
  expect(passed[1]).toBe(kit);
  expect(result.current.decisionError).toBeUndefined();
});

test('useUiDecision narrowing decision error passes the original components, kit intact', async () => {
  const setComponents = withFakeCompletion();
  const kit = ɵcreateUiKit<any>({ components: [note, table] });
  const components = [flight, kit];
  const failure = new Error('decide failed');
  const fake = createFakeTransport(() => Promise.reject(failure));

  const { result } = renderHook(
    () =>
      useUiDecision({
        input: 'something',
        components,
        select: { max: 2 },
        generate: { system: 'Render it' },
      }),
    { wrapper: wrapperFor(fake.transport) },
  );
  await waitFor(() => expect(setComponents).toHaveBeenCalled());

  const passed = setComponents.mock.calls[0][0];
  expect(passed).toEqual(components);
  expect(passed[1]).toBe(kit);
  expect(result.current.decisionError).toBe(failure);
});

test('useUiDecision narrowing with no components skips the decision', async () => {
  const setComponents = withFakeCompletion();
  const fake = createFakeTransport(() => pickResponse('Note', 0.9, ['Note']));

  const { result } = renderHook(
    () =>
      useUiDecision({
        input: 'hello',
        components: [],
        select: 'one',
        generate: { system: 'Render it' },
      }),
    { wrapper: wrapperFor(fake.transport) },
  );
  await waitFor(() => expect(setComponents).toHaveBeenCalled());

  expect(setComponents.mock.calls[0][0]).toEqual([]);
  expect(fake.calls).toHaveLength(0);
  expect(result.current.isDeciding).toBe(false);
  expect(result.current.decisionError).toBeUndefined();
  expect(result.current.decision.isLoading).toBe(false);
  expect(useUiCompletionMock.mock.lastCall?.[0].input).toBe('hello');
});

test('useUiDecision narrowing with low confidence passes all components', async () => {
  const setComponents = withFakeCompletion();
  const components = [flight, airport, weather];
  const fake = createFakeTransport(() =>
    pickResponse('Airport', 0.4, ['Flight', 'Airport', 'Weather']),
  );

  const { result } = renderHook(
    () =>
      useUiDecision({
        input: 'something',
        components,
        select: 'one',
        minConfidence: 0.7,
        generate: { system: 'Render it' },
      }),
    { wrapper: wrapperFor(fake.transport) },
  );
  await waitFor(() => expect(setComponents).toHaveBeenCalled());

  expect(setComponents.mock.calls[0][0]).toEqual(components);
  expect(useUiCompletionMock.mock.lastCall?.[0].input).toBe('something');
  expect(result.current.decisionError).toBeUndefined();
});

test('useUiDecision narrowing phase 1 error passes all components and exposes decisionError', async () => {
  const setComponents = withFakeCompletion();
  const components = [flight, airport, weather];
  const failure = new Error('decide failed');
  const fake = createFakeTransport(() => Promise.reject(failure));

  const { result } = renderHook(
    () =>
      useUiDecision({
        input: 'something',
        components,
        select: { max: 2 },
        generate: { system: 'Render it' },
      }),
    { wrapper: wrapperFor(fake.transport) },
  );
  await waitFor(() => expect(setComponents).toHaveBeenCalled());

  expect(setComponents.mock.calls[0][0]).toEqual(components);
  expect(result.current.decisionError).toBe(failure);
  expect(result.current.error).toBeUndefined();
  expect(useUiCompletionMock.mock.lastCall?.[0].input).toBe('something');
});

test('useUiDecision narrowing re-decides on input change before generating again', async () => {
  const setComponents = withFakeCompletion();
  const ids = ['Flight', 'Airport', 'Weather'];
  const deferred = deferredTransport();
  const { rerender } = renderHook(
    ({ input }: { input: string }) =>
      useUiDecision({
        input,
        components: [flight, airport, weather],
        select: 'one',
        generate: { system: 'Render it' },
      }),
    { initialProps: { input: 'one' }, wrapper: wrapperFor(deferred.transport) },
  );
  await waitFor(() => expect(deferred.calls).toHaveLength(1));
  await act(async () => {
    deferred.resolve(pickResponse('Flight', 0.9, ids));
  });
  await waitFor(() => expect(setComponents).toHaveBeenCalledTimes(1));
  useUiCompletionMock.mockClear();

  rerender({ input: 'two' });
  await waitFor(() => expect(deferred.calls).toHaveLength(2));

  for (const [options] of useUiCompletionMock.mock.calls) {
    expect(options.input).not.toBe('two');
  }
  expect(useUiCompletionMock.mock.lastCall?.[0].input).toBeNull();

  await act(async () => {
    deferred.resolve(pickResponse('Weather', 0.9, ids));
  });
  await waitFor(() => expect(setComponents).toHaveBeenCalledTimes(2));

  expect(setComponents.mock.calls[1][0]).toEqual([weather]);
  expect(useUiCompletionMock.mock.lastCall?.[0].input).toBe('two');
});

test('useUiDecision narrowing sends the first generation with only the chosen components', async () => {
  withRealCompletion();
  const bodies: string[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
    bodies.push(String(init?.body));
    return new Promise<Response>(() => undefined);
  });
  vi.stubGlobal('fetch', fetchMock);
  const fake = createFakeTransport(() =>
    pickResponse('Airport', 0.9, ['Flight', 'Airport', 'Weather']),
  );

  let unmount: () => void = () => undefined;
  try {
    unmount = renderHook(
      () =>
        useUiDecision({
          input: 'show KSFO',
          components: [flight, airport, weather],
          select: 'one',
          generate: { system: 'Render it' },
        }),
      { wrapper: wrapperFor(fake.transport) },
    ).unmount;
    await waitFor(() => expect(bodies.length).toBeGreaterThan(0));
  } finally {
    unmount();
    vi.unstubAllGlobals();
  }

  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toContain('Airport');
  expect(bodies[0]).not.toContain('Weather');
  expect(bodies[0]).not.toContain('Flight');
});

test('useUiDecision narrowing settles with every component after decision.stop()', async () => {
  const setComponents = withFakeCompletion();
  const ids = ['Flight', 'Airport', 'Weather'];
  const components = [flight, airport, weather];
  const deferred = deferredTransport();
  const { result, rerender } = renderHook(
    ({ input }: { input: string }) =>
      useUiDecision({
        input,
        components,
        select: 'one',
        generate: { system: 'Render it' },
      }),
    { initialProps: { input: 'one' }, wrapper: wrapperFor(deferred.transport) },
  );
  await waitFor(() => expect(deferred.calls).toHaveLength(1));
  await act(async () => {
    deferred.resolve(pickResponse('Flight', 0.9, ids));
  });
  await waitFor(() => expect(setComponents).toHaveBeenCalledTimes(1));
  rerender({ input: 'two' });
  await waitFor(() => expect(result.current.decision.isLoading).toBe(true));

  act(() => result.current.decision.stop());
  await waitFor(() => expect(setComponents).toHaveBeenCalledTimes(2));

  expect(setComponents.mock.calls[1][0]).toEqual(components);
  expect(result.current.isDeciding).toBe(false);
  expect(result.current.isLoading).toBe(false);
  expect(result.current.decisionError).toBeUndefined();
  expect(useUiCompletionMock.mock.lastCall?.[0].input).toBe('two');
});

test('useUiDecision candidates with no candidates renders nothing', async () => {
  withRealCompletion();
  const fake = createFakeTransport(() =>
    pickResponse('flight', 0.9, ['flight']),
  );

  const { result } = renderHook(
    () => useUiDecision({ input: 'hello', candidates: [], select: 'one' }),
    { wrapper: wrapperFor(fake.transport) },
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  expect(result.current.ids).toEqual([]);
  expect(result.current.ui).toEqual([]);
  expect(result.current.error).toBeUndefined();
  expect(fake.calls).toHaveLength(0);
});

test('useUiDecision sends system with the input to the selection decision', async () => {
  withRealCompletion();
  const fake = createFakeTransport(() =>
    pickResponse('airport', 0.9, ['flight', 'airport', 'weather']),
  );

  const { result } = renderHook(
    () =>
      useUiDecision({
        input: 'show KSFO',
        system: 'You pick cards in a flight-tracking app.',
        candidates,
        select: 'one',
      }),
    { wrapper: wrapperFor(fake.transport) },
  );
  await waitFor(() => expect(result.current.ids).toEqual(['airport']));

  expect(fake.calls[0].request.state).toEqual({
    system: 'You pick cards in a flight-tracking app.',
    input: 'show KSFO',
  });
});

test("useUiDecision shuffles the selection options with optionOrder: 'shuffled'", async () => {
  withRealCompletion();
  const random = vi.spyOn(Math, 'random').mockReturnValue(0);
  const fake = createFakeTransport(() =>
    pickResponse('airport', 0.9, ['flight', 'airport', 'weather']),
  );

  try {
    const { result } = renderHook(
      () =>
        useUiDecision({
          input: 'show KSFO',
          optionOrder: 'shuffled',
          candidates,
          select: 'one',
        }),
      { wrapper: wrapperFor(fake.transport) },
    );
    await waitFor(() => expect(result.current.ids).toEqual(['airport']));
  } finally {
    random.mockRestore();
  }

  const question = fake.calls[0].request.questions['pick'] as {
    options: Record<string, string | null>;
  };
  expect(Object.keys(question.options)).toEqual([
    'airport',
    'weather',
    'flight',
  ]);
});

test('useUiDecision debounces the selection decision with debounceTime', async () => {
  withRealCompletion();
  const fake = createFakeTransport(() =>
    pickResponse('airport', 0.9, ['flight', 'airport', 'weather']),
  );

  const { result, rerender } = renderHook(
    ({ input }: { input: string }) =>
      useUiDecision({ input, debounceTime: 50, candidates, select: 'one' }),
    { wrapper: wrapperFor(fake.transport), initialProps: { input: 'show' } },
  );
  rerender({ input: 'show KSFO' });
  await waitFor(() => expect(result.current.ids).toEqual(['airport']));

  expect(fake.calls).toHaveLength(1);
  expect(fake.calls[0].request.state).toBe('show KSFO');
});

test('useUiDecision narrowing waits for the new decision after system changes', async () => {
  const setComponents = withFakeCompletion();
  const ids = ['Flight', 'Airport', 'Weather'];
  const fake = createFakeTransport(() => pickResponse('Flight', 0.9, ids));
  const { rerender } = renderHook(
    ({ system }: { system: string }) =>
      useUiDecision({
        input: 'show N123',
        system,
        debounceTime: 20,
        components: [flight, airport, weather],
        select: 'one',
        generate: { system: 'Render it' },
      }),
    {
      initialProps: { system: 'First context' },
      wrapper: wrapperFor(fake.transport),
    },
  );
  await waitFor(() => expect(setComponents).toHaveBeenCalledTimes(1));

  rerender({ system: 'Second context' });
  await waitFor(() => expect(fake.calls).toHaveLength(2));
  await waitFor(() => expect(setComponents).toHaveBeenCalledTimes(2));

  for (const [chosen] of setComponents.mock.calls) {
    expect(chosen).toEqual([flight]);
  }
  expect(fake.calls[1].request.state).toEqual({
    system: 'Second context',
    input: 'show N123',
  });
});

test('useUiDecision narrowing falls back when a kit cannot be decided over', () => {
  const setComponents = withFakeCompletion();
  const Bad = () => null;
  const kit = ɵcreateUiKit<any>({
    components: [
      note,
      exposeComponent(Bad, { name: 'Bad.Name', description: 'Invalid id' }),
    ],
  });
  const components = [kit];
  const fake = createFakeTransport(() => pickResponse('Note', 0.9, ['Note']));

  const { result } = renderHook(
    () =>
      useUiDecision({
        input: 'hello',
        components,
        select: 'one',
        generate: { system: 'Render it' },
      }),
    { wrapper: wrapperFor(fake.transport) },
  );

  expect(setComponents.mock.calls[0][0]).toBe(components);
  expect(result.current.decisionError).toBeInstanceOf(DecisionSchemaError);
  expect(result.current.isDeciding).toBe(false);
  expect(fake.calls).toHaveLength(0);
  expect(useUiCompletionMock.mock.lastCall?.[0].input).toBe('hello');
});
