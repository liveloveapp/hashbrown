import { type Provider, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Decision, s } from '@hashbrownai/core';
import { vi } from 'vitest';
import { provideHashbrown } from '../providers';
import { decisionResource } from './decision-resource.fn';

const schema = s.object('Decision', {
  intent: s.enumeration('Intent', ['filter', 'chat']),
});

const choice = { confidence: 0.9, probabilities: { filter: 0.9, chat: 0.1 } };

function responseFor(intent: string): Decision.Response {
  return {
    kind: 'hashbrown.decision',
    version: 1,
    value: { intent },
    meta: { intent: choice },
  };
}

type Call = { request: Decision.Request; signal: AbortSignal };

function createFakeTransport(intent = 'filter') {
  const calls: Call[] = [];
  const transport: Decision.Transport = async (request, signal) => {
    calls.push({ request, signal });
    return responseFor(intent);
  };
  return { calls, transport };
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  TestBed.tick();
}

function configure(providers: Provider[] = [provideHashbrown({})]) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers });
}

test('decisionResource returns a typed value and meta', async () => {
  // Arrange
  const fake = createFakeTransport();
  configure([provideHashbrown({ decision: { transport: fake.transport } })]);

  // Act
  const ref = TestBed.runInInjectionContext(() =>
    decisionResource({ schema, input: signal('show open items') }),
  );
  await settle();

  // Assert
  expect(ref.value()?.intent).toBe('filter');
  expect(ref.meta()?.intent.confidence).toBe(0.9);
  expect(ref.isLoading()).toBe(false);
  expect(ref.error()).toBeUndefined();
});

test("decisionResource uses the provider's decision transport and the option override wins", async () => {
  // Arrange
  const provider = createFakeTransport('filter');
  const override = createFakeTransport('chat');
  configure([
    provideHashbrown({ decision: { transport: provider.transport } }),
  ]);

  // Act
  const ref = TestBed.runInInjectionContext(() =>
    decisionResource({
      schema,
      input: signal('hello'),
      transport: override.transport,
    }),
  );
  await settle();

  // Assert
  expect(provider.calls).toHaveLength(0);
  expect(override.calls).toHaveLength(1);
  expect(ref.value()?.intent).toBe('chat');
});

test('decisionResource default transport posts to /api/decide with provider middleware', async () => {
  // Arrange
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(responseFor('filter')), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const middleware = [
    (request: RequestInit): RequestInit => ({
      ...request,
      headers: { ...(request.headers as object), 'x-test': 'yes' },
    }),
  ];
  configure([provideHashbrown({ middleware })]);

  // Act
  try {
    TestBed.runInInjectionContext(() =>
      decisionResource({ schema, input: signal('hello') }),
    );
    await settle();
  } finally {
    vi.unstubAllGlobals();
  }

  // Assert
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/decide');
  expect(new Headers(init?.headers).get('x-test')).toBe('yes');
});

test('decisionResource re-decides on input change', async () => {
  // Arrange
  const fake = createFakeTransport();
  configure();
  const input = signal<string | null | undefined>('one');
  TestBed.runInInjectionContext(() =>
    decisionResource({ schema, input, transport: fake.transport }),
  );
  await settle();

  // Act
  input.set('two');
  await settle();

  // Assert
  expect(fake.calls).toHaveLength(2);
  expect(fake.calls[1].request.state).toBe('two');
});

test('decisionResource treats null and undefined input as idle', async () => {
  // Arrange
  const fake = createFakeTransport();
  configure();
  const input = signal<string | null | undefined>('one');
  const ref = TestBed.runInInjectionContext(() =>
    decisionResource({ schema, input, transport: fake.transport }),
  );
  await settle();

  // Act
  input.set(undefined);
  await settle();

  // Assert
  expect(fake.calls).toHaveLength(1);
  expect(ref.value()).toBeNull();
  expect(ref.isLoading()).toBe(false);
});

test('decisionResource throws without provideHashbrown', () => {
  // Arrange
  configure([]);

  // Act
  const create = () =>
    TestBed.runInInjectionContext(() =>
      decisionResource({ schema, input: signal('hello') }),
    );

  // Assert
  expect(create).toThrow();
});

test('decisionResource aborts the old request when system changes', async () => {
  // Arrange
  configure();
  const signals: AbortSignal[] = [];
  const system = signal('a');
  TestBed.runInInjectionContext(() =>
    decisionResource({
      schema,
      input: signal('hello'),
      system,
      transport: (_request, signal) => {
        signals.push(signal);
        return new Promise<Decision.Response>(() => undefined);
      },
    }),
  );
  await settle();

  // Act
  system.set('b');
  await settle();

  // Assert
  expect(signals).toHaveLength(2);
  expect(signals[0].aborted).toBe(true);
  expect(signals[1].aborted).toBe(false);
});

test('decisionResource with an inline transport decides exactly once per input', async () => {
  // Arrange
  configure();
  const calls: Decision.Request[] = [];

  // Act
  TestBed.runInInjectionContext(() =>
    decisionResource({
      schema,
      input: signal('hello'),
      transport: async (request) => {
        calls.push(request);
        return responseFor('filter');
      },
    }),
  );
  await settle();
  await settle();

  // Assert
  expect(calls).toHaveLength(1);
});

test('decisionResource re-decides when system changes', async () => {
  // Arrange
  const fake = createFakeTransport();
  configure();
  const system = signal('a');
  TestBed.runInInjectionContext(() =>
    decisionResource({
      schema,
      input: signal('hello'),
      system,
      transport: fake.transport,
    }),
  );
  await settle();

  // Act
  system.set('b');
  await settle();

  // Assert
  expect(fake.calls).toHaveLength(2);
  expect(fake.calls[0].request.state).toEqual({ system: 'a', input: 'hello' });
  expect(fake.calls[1].request.state).toEqual({ system: 'b', input: 'hello' });
});

test('decisionResource aborts on destroy mid-request and never updates', async () => {
  // Arrange
  configure();
  let release: (response: Decision.Response) => void = () => undefined;
  let requestSignal: AbortSignal | undefined;
  const transport: Decision.Transport = (_request, signal) => {
    requestSignal = signal;
    return new Promise<Decision.Response>((resolve) => {
      release = resolve;
    });
  };
  const ref = TestBed.runInInjectionContext(() =>
    decisionResource({ schema, input: signal('hello'), transport }),
  );
  await settle();
  expect(ref.isLoading()).toBe(true);

  // Act
  TestBed.resetTestingModule();
  release(responseFor('filter'));
  await new Promise((resolve) => setTimeout(resolve, 0));

  // Assert
  expect(requestSignal?.aborted).toBe(true);
  expect(ref.value()).toBeNull();
  expect(ref.isLoading()).toBe(true);
});

test('decisionResource reload resends and stop aborts', async () => {
  // Arrange
  configure();
  let requestSignal: AbortSignal | undefined;
  let count = 0;
  const transport: Decision.Transport = (_request, signal) => {
    count++;
    requestSignal = signal;
    return new Promise<Decision.Response>(() => undefined);
  };
  const ref = TestBed.runInInjectionContext(() =>
    decisionResource({ schema, input: signal('hello'), transport }),
  );
  await settle();

  // Act
  const reloaded = ref.reload();
  await settle();

  // Assert
  expect(reloaded).toBe(true);
  expect(count).toBe(2);

  // Act
  ref.stop();
  await settle();

  // Assert
  expect(requestSignal?.aborted).toBe(true);
  expect(ref.isLoading()).toBe(false);
});
