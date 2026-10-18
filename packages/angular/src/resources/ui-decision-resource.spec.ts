/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Component,
  computed,
  DestroyRef,
  inject,
  InjectionToken,
  Injector,
  type Provider,
  type ResourceStatus,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Decision } from '@hashbrownai/core';
import { vi } from 'vitest';
import { provideHashbrown } from '../providers';
import { createUiKit } from '../utils/ui-kit.fn';
import { uiCompletionResource } from './ui-completion-resource.fn';
import { uiDecisionResource } from './ui-decision-resource.fn';

vi.mock('./ui-completion-resource.fn', () => ({
  uiCompletionResource: vi.fn(),
}));

const uiCompletionResourceMock = vi.mocked(uiCompletionResource);

interface Created {
  options: Parameters<typeof uiCompletionResource>[0];
  destroyed: boolean;
  status: ReturnType<typeof signal<ResourceStatus>>;
  value: ReturnType<typeof signal<any>>;
}

function trackCompletions(): Created[] {
  const created: Created[] = [];
  uiCompletionResourceMock.mockReset();
  uiCompletionResourceMock.mockImplementation((options) => {
    const entry: Created = {
      options,
      destroyed: false,
      status: signal<ResourceStatus>('idle'),
      value: signal<any>(null),
    };
    inject(DestroyRef).onDestroy(() => {
      entry.destroyed = true;
    });
    created.push(entry);
    return {
      value: entry.value,
      status: entry.status,
      error: signal(undefined),
      isLoading: computed(() => entry.status() === 'loading'),
      reload: vi.fn(() => true),
      stop: vi.fn(),
    } as any;
  });
  return created;
}

type Call = { request: Decision.Request; signal: AbortSignal };

function createFakeTransport(
  respond: (request: Decision.Request) => Decision.Response,
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

async function settle() {
  for (let i = 0; i < 5; i++) {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  TestBed.tick();
}

function configure(transport: Decision.Transport, providers: Provider[] = []) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ decision: { transport } }), ...providers],
  });
}

class FlightCard {}
class AirportCard {}
class WeatherCard {}

const candidates = [
  { id: 'flight', description: 'One aircraft', component: FlightCard },
  { id: 'airport', description: 'An airport', component: AirportCard },
  { id: 'weather', description: 'The weather', component: WeatherCard },
];

const flight = {
  component: FlightCard,
  name: 'Flight',
  description: 'One aircraft',
};
const airport = {
  component: AirportCard,
  name: 'Airport',
  description: 'An airport',
};
const weather = {
  component: WeatherCard,
  name: 'Weather',
  description: 'The weather',
};
const ids = ['Flight', 'Airport', 'Weather'];

test("uiDecisionResource candidates 'one' chooses only the picked candidate", async () => {
  const created = trackCompletions();
  const fake = createFakeTransport(() =>
    pickResponse('airport', 0.9, ['flight', 'airport', 'weather']),
  );
  configure(fake.transport);

  const ref = TestBed.runInInjectionContext(() =>
    uiDecisionResource({
      input: signal('show KSFO'),
      candidates,
      select: 'one',
    }),
  );
  await settle();

  expect(ref.ids()).toEqual(['airport']);
  expect(ref.chosen().map((candidate) => candidate.component)).toEqual([
    AirportCard,
  ]);
  expect(ref.decision.value()).toEqual({ pick: 'airport' });
  expect(ref.isLoading()).toBe(false);
  expect(ref.error()).toBeUndefined();
  expect(fake.calls).toHaveLength(1);
  expect(created).toHaveLength(0);
});

test('uiDecisionResource candidates { max: 2 } chooses in probability order', async () => {
  trackCompletions();
  const fake = createFakeTransport(() =>
    multiResponse({ flight: 0.6, airport: 0.2, weather: 0.95 }),
  );
  configure(fake.transport);

  const ref = TestBed.runInInjectionContext(() =>
    uiDecisionResource({
      input: signal('storm'),
      candidates,
      select: { max: 2 },
    }),
  );
  await settle();

  expect(ref.ids()).toEqual(['weather', 'flight']);
  expect(ref.chosen().map((candidate) => candidate.id)).toEqual([
    'weather',
    'flight',
  ]);
});

test('uiDecisionResource candidates below minConfidence chooses nothing', async () => {
  trackCompletions();
  const fake = createFakeTransport(() =>
    pickResponse('airport', 0.4, ['flight', 'airport', 'weather']),
  );
  configure(fake.transport);

  const ref = TestBed.runInInjectionContext(() =>
    uiDecisionResource({
      input: signal('hmm'),
      candidates,
      select: 'one',
      minConfidence: 0.7,
    }),
  );
  await settle();

  expect(ref.decision.value()).not.toBeNull();
  expect(ref.ids()).toEqual([]);
  expect(ref.chosen()).toEqual([]);
});

test('uiDecisionResource candidates with no candidates chooses nothing without a request', async () => {
  trackCompletions();
  const fake = createFakeTransport(() =>
    pickResponse('flight', 0.9, ['flight']),
  );
  configure(fake.transport);

  const ref = TestBed.runInInjectionContext(() =>
    uiDecisionResource({
      input: signal('hello'),
      candidates: [],
      select: 'one',
    }),
  );
  await settle();

  expect(ref.ids()).toEqual([]);
  expect(ref.chosen()).toEqual([]);
  expect(ref.error()).toBeUndefined();
  expect(fake.calls).toHaveLength(0);
});

test('uiDecisionResource narrowing holds phase 2 until phase 1 settles, then passes only the chosen components', async () => {
  const created = trackCompletions();
  const Note = class {};
  const kit = createUiKit<any>({
    components: [{ component: Note, name: 'Note', description: 'A note' }],
  });
  const deferred = deferredTransport();
  configure(deferred.transport);
  const ref = TestBed.runInInjectionContext(() =>
    uiDecisionResource({
      input: signal('show KSFO'),
      components: [flight, kit, airport, weather],
      select: 'one',
      generate: { system: 'Render it' },
    }),
  );
  await settle();

  expect(deferred.calls).toHaveLength(1);
  expect(ref.isDeciding()).toBe(true);
  expect(ref.isLoading()).toBe(true);
  expect(created).toHaveLength(0);
  expect(ref.value()).toBeNull();
  expect(ref.isGenerating()).toBe(false);
  const questions = JSON.stringify(deferred.calls[0].request.questions);
  expect(questions).toContain('Airport');
  expect(questions).not.toContain('Note');

  deferred.resolve(pickResponse('Airport', 0.9, ids));
  await settle();

  expect(created).toHaveLength(1);
  expect(created[0].options.components).toEqual([kit, airport]);
  expect(created[0].options.components[0]).toBe(kit);
  expect(created[0].options.input()).toBe('show KSFO');
  expect(created[0].options.system).toBe('Render it');
  expect(ref.isDeciding()).toBe(false);
  expect(ref.decisionError()).toBeUndefined();
});

test('uiDecisionResource narrowing passes through the phase 2 value and status', async () => {
  const created = trackCompletions();
  const fake = createFakeTransport(() => pickResponse('Airport', 0.9, ids));
  configure(fake.transport);
  const ref = TestBed.runInInjectionContext(() =>
    uiDecisionResource({
      input: signal('show KSFO'),
      components: [flight, airport, weather],
      select: 'one',
      generate: { system: 'Render it' },
    }),
  );
  await settle();
  const message = { role: 'assistant', content: { ui: [] }, toolCalls: [] };

  created[0].value.set(message);
  created[0].status.set('loading');

  expect(ref.value()).toBe(message);
  expect(ref.isGenerating()).toBe(true);
  expect(ref.isLoading()).toBe(true);
});

test('uiDecisionResource narrowing with low confidence passes all components', async () => {
  const created = trackCompletions();
  const components = [flight, airport, weather];
  const fake = createFakeTransport(() => pickResponse('Airport', 0.4, ids));
  configure(fake.transport);

  const ref = TestBed.runInInjectionContext(() =>
    uiDecisionResource({
      input: signal('something'),
      components,
      select: 'one',
      minConfidence: 0.7,
      generate: { system: 'Render it' },
    }),
  );
  await settle();

  expect(created).toHaveLength(1);
  expect(created[0].options.components).toEqual(components);
  expect(created[0].options.input()).toBe('something');
  expect(ref.decisionError()).toBeUndefined();
});

test('uiDecisionResource narrowing phase 1 error passes all components and exposes decisionError', async () => {
  const created = trackCompletions();
  const components = [flight, airport, weather];
  const failure = new Error('decide failed');
  const fake = createFakeTransport(() => {
    throw failure;
  });
  configure(fake.transport);

  const ref = TestBed.runInInjectionContext(() =>
    uiDecisionResource({
      input: signal('something'),
      components,
      select: { max: 2 },
      generate: { system: 'Render it' },
    }),
  );
  await settle();

  expect(created).toHaveLength(1);
  expect(created[0].options.components).toEqual(components);
  expect(ref.decisionError()).toBe(failure);
  expect(ref.error()).toBeUndefined();
  expect(created[0].options.input()).toBe('something');
});

test('uiDecisionResource narrowing re-decides on input change and swaps the phase 2 resource', async () => {
  const created = trackCompletions();
  const deferred = deferredTransport();
  configure(deferred.transport);
  const input = signal('one');
  const ref = TestBed.runInInjectionContext(() =>
    uiDecisionResource({
      input,
      components: [flight, airport, weather],
      select: 'one',
      generate: { system: 'Render it' },
    }),
  );
  await settle();
  deferred.resolve(pickResponse('Flight', 0.9, ids));
  await settle();
  expect(created).toHaveLength(1);

  input.set('two');
  await settle();

  expect(deferred.calls).toHaveLength(2);
  expect(ref.isDeciding()).toBe(true);
  expect(created).toHaveLength(1);
  expect(created[0].options.input()).toBeNull();
  expect(created[0].destroyed).toBe(false);

  deferred.resolve(pickResponse('Weather', 0.9, ids));
  await settle();

  expect(created).toHaveLength(2);
  expect(created[0].destroyed).toBe(true);
  expect(created[0].options.input()).toBeNull();
  expect(created[1].options.components).toEqual([weather]);
  expect(created[1].options.input()).toBe('two');
  expect(created[1].destroyed).toBe(false);
});

test('uiDecisionResource narrowing keeps the phase 2 resource when the chosen set is unchanged', async () => {
  const created = trackCompletions();
  const fake = createFakeTransport(() => pickResponse('Flight', 0.9, ids));
  configure(fake.transport);
  const input = signal('one');
  TestBed.runInInjectionContext(() =>
    uiDecisionResource({
      input,
      components: [flight, airport, weather],
      select: 'one',
      generate: { system: 'Render it' },
    }),
  );
  await settle();

  input.set('two');
  await settle();

  expect(fake.calls).toHaveLength(2);
  expect(created).toHaveLength(1);
  expect(created[0].options.input()).toBe('two');
});

test('uiDecisionResource narrowing settles with every component after decision.stop()', async () => {
  const created = trackCompletions();
  const components = [flight, airport, weather];
  const deferred = deferredTransport();
  configure(deferred.transport);
  const input = signal('one');
  const ref = TestBed.runInInjectionContext(() =>
    uiDecisionResource({
      input,
      components,
      select: 'one',
      generate: { system: 'Render it' },
    }),
  );
  await settle();
  deferred.resolve(pickResponse('Flight', 0.9, ids));
  await settle();
  input.set('two');
  await settle();
  expect(ref.decision.isLoading()).toBe(true);

  ref.decision.stop();
  await settle();

  expect(created).toHaveLength(2);
  expect(created[1].options.components).toEqual(components);
  expect(created[1].options.input()).toBe('two');
  expect(ref.isDeciding()).toBe(false);
  expect(ref.isLoading()).toBe(false);
  expect(ref.decisionError()).toBeUndefined();
});

test('uiDecisionResource narrowing with only UI kits skips the decision', async () => {
  const created = trackCompletions();
  const kit = createUiKit<any>({
    components: [{ component: class {}, name: 'Note', description: 'A note' }],
  });
  const fake = createFakeTransport(() => pickResponse('Note', 0.9, ['Note']));
  configure(fake.transport);

  const ref = TestBed.runInInjectionContext(() =>
    uiDecisionResource({
      input: signal('hello'),
      components: [kit],
      select: 'one',
      generate: { system: 'Render it' },
    }),
  );
  await settle();

  expect(created).toHaveLength(1);
  expect(created[0].options.components).toEqual([kit]);
  expect(created[0].options.input()).toBe('hello');
  expect(fake.calls).toHaveLength(0);
  expect(ref.isDeciding()).toBe(false);
  expect(ref.decisionError()).toBeUndefined();
  expect(ref.decision.isLoading()).toBe(false);
});

test('uiDecisionResource narrowing destroys the phase 2 injector with its context', async () => {
  const created = trackCompletions();
  const fake = createFakeTransport(() => pickResponse('Flight', 0.9, ids));
  configure(fake.transport);
  const context = Injector.create({
    providers: [],
    parent: TestBed.inject(Injector),
  });
  const ref = runInInjectionContext(context, () =>
    uiDecisionResource({
      input: signal('one'),
      components: [flight, airport, weather],
      select: 'one',
      generate: { system: 'Render it' },
    }),
  );
  await settle();
  expect(created).toHaveLength(1);

  context.destroy();
  await settle();

  expect(created[0].destroyed).toBe(true);
  expect(ref.value()).toBeNull();
});

const CONTEXT_TOKEN = new InjectionToken<string>('ui-decision-context');

@Component({
  selector: 'hb-test-host',
  template: '',
  providers: [{ provide: CONTEXT_TOKEN, useValue: 'from-component' }],
})
class HostComponent {
  resource = uiDecisionResource({
    input: signal('one'),
    components: [flight, airport, weather],
    select: 'one',
    generate: { system: 'Render it' },
  });
}

test('uiDecisionResource narrowing creates phase 2 under the calling node injector', async () => {
  const seen: unknown[] = [];
  trackCompletions();
  uiCompletionResourceMock.mockImplementation(() => {
    seen.push(inject(CONTEXT_TOKEN, { optional: true }));
    return {
      value: signal(null),
      status: signal('idle'),
      error: signal(undefined),
      isLoading: signal(false),
      reload: vi.fn(() => true),
      stop: vi.fn(),
    } as any;
  });
  const fake = createFakeTransport(() => pickResponse('Flight', 0.9, ids));
  configure(fake.transport);

  const fixture = TestBed.createComponent(HostComponent);
  await settle();

  expect(fixture.componentInstance.resource.isDeciding()).toBe(false);
  expect(seen).toEqual(['from-component']);
});
