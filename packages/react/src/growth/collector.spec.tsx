import { EventType } from '@ag-ui/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import {
  type Decision,
  s,
  type TransportRequest,
  ɵcreateDevelopmentCollector,
  ɵreportMilestone,
} from '@hashbrownai/core';
import { exposeComponent } from '../expose-component.fn';
import { HashbrownProvider } from '../hashbrown-provider';
import { useChat } from '../hooks/use-chat';
import { useUiChat } from '../hooks/use-ui-chat';
import { useUiDecision } from '../hooks/use-ui-decision';
import { PACKAGE_VERSION } from '../package-version';
import { isDevelopmentBuild } from './collector';

vi.mock('@hashbrownai/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hashbrownai/core')>();

  return {
    ...actual,
    ɵcreateDevelopmentCollector: vi.fn(() => ({
      attach: vi.fn(() => vi.fn()),
      dispose: vi.fn(),
    })),
    ɵreportMilestone: vi.fn(),
  };
});

const createCollectorMock = vi.mocked(ɵcreateDevelopmentCollector);
const reportMilestoneMock = vi.mocked(ɵreportMilestone);

const Flight = () => null;
const flight = exposeComponent(Flight, {
  name: 'Flight',
  description: 'One aircraft',
  props: { callsign: s.string('Callsign') },
});

function answer(request: TransportRequest, messageId: string, ui: unknown) {
  const identity = {
    threadId: request.input.threadId,
    runId: request.input.runId,
  };
  return {
    events: (async function* () {
      yield { type: EventType.RUN_STARTED, ...identity };
      yield {
        type: EventType.TEXT_MESSAGE_START,
        messageId,
        role: 'assistant' as const,
      };
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta: JSON.stringify({ ui }),
      };
      yield { type: EventType.TEXT_MESSAGE_END, messageId };
      yield { type: EventType.RUN_FINISHED, ...identity };
    })(),
  };
}

function wrapperFor(send: (request: TransportRequest) => unknown) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <HashbrownProvider transport={{ name: 'test', send } as never}>
        {children}
      </HashbrownProvider>
    );
  };
}

test('the provider creates one react collector and attaches it to each chat runtime', () => {
  createCollectorMock.mockClear();
  const send = vi.fn();

  const { result, rerender } = renderHook(
    () => useChat({ system: 'Answer.' }),
    { wrapper: wrapperFor(send) },
  );
  rerender();

  expect(createCollectorMock).toHaveBeenCalledTimes(1);
  const options = createCollectorMock.mock.calls[0]?.[0];
  expect(options).toMatchObject({
    integration: 'react',
    packageName: '@hashbrownai/react',
    packageVersion: PACKAGE_VERSION,
  });
  const collector = createCollectorMock.mock.results[0]?.value;
  expect(collector.attach).toHaveBeenCalledTimes(1);
  expect(collector.attach.mock.calls[0]?.[0].resume).toBe(
    result.current.resume,
  );
});

test('telemetry false disables collection and a nested provider cannot re-enable it', () => {
  createCollectorMock.mockClear();
  const send = vi.fn();
  const transport = { name: 'test', send } as never;

  renderHook(() => useChat({ system: 'Answer.' }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <HashbrownProvider transport={transport} telemetry={false}>
        <HashbrownProvider transport={transport} telemetry={true}>
          {children}
        </HashbrownProvider>
      </HashbrownProvider>
    ),
  });

  const [outer, inner] = createCollectorMock.mock.calls.map(
    ([options]) => options,
  );
  expect(outer?.enabled?.()).toBe(false);
  expect(inner?.enabled?.()).toBe(false);
});

test('isDevelopmentBuild is false when process is undefined', () => {
  const original = globalThis.process;
  let result: boolean;

  try {
    // @ts-expect-error simulates a browser without a bundler
    delete globalThis.process;
    result = isDevelopmentBuild();
  } finally {
    globalThis.process = original;
  }

  expect(result).toBe(false);
});

test('isDevelopmentBuild is false in a test runner', () => {
  vi.stubEnv('NODE_ENV', 'test');
  let result: boolean;

  try {
    result = isDevelopmentBuild();
  } finally {
    vi.unstubAllEnvs();
  }

  expect(result).toBe(false);
});

test('rendering a component through useUiChat reports component.first_rendered once', async () => {
  reportMilestoneMock.mockClear();
  createCollectorMock.mockClear();
  const send = vi.fn(async (request: TransportRequest) =>
    answer(request, 'answer-1', [{ Flight: { props: { callsign: 'UA1' } } }]),
  );
  const { result, rerender } = renderHook(
    () =>
      useUiChat({
        system: 'Answer.',
        components: [flight],
        debounceTime: 0,
      }),
    { wrapper: wrapperFor(send) },
  );

  act(() => result.current.sendMessage({ role: 'user', content: 'UA1' }));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  await waitFor(() => expect(result.current.messages).toHaveLength(2));
  rerender();

  const collector = createCollectorMock.mock.results[0]?.value;
  const firstRendered = reportMilestoneMock.mock.calls.filter(
    ([, kind]) => kind === 'component.first_rendered',
  );
  expect(firstRendered).toEqual([[collector, 'component.first_rendered']]);
});

test('a confident useUiDecision candidate reports component.first_rendered once', async () => {
  reportMilestoneMock.mockClear();
  createCollectorMock.mockClear();
  const transport: Decision.Transport = async () => ({
    kind: 'hashbrown.decision',
    version: 1,
    value: { pick: 'airport' },
    meta: {
      pick: { confidence: 0.9, probabilities: { flight: 0.1, airport: 0.9 } },
    },
  });
  const candidates = [
    { id: 'flight', description: 'One aircraft', element: <p>flight</p> },
    { id: 'airport', description: 'An airport', element: <p>airport</p> },
  ];
  const { result, rerender } = renderHook(
    () => useUiDecision({ input: 'show KSFO', candidates, select: 'one' }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <HashbrownProvider decision={{ transport }}>
          {children}
        </HashbrownProvider>
      ),
    },
  );

  await waitFor(() => expect(result.current.ids).toEqual(['airport']));
  rerender();

  const collector = createCollectorMock.mock.results[0]?.value;
  expect(reportMilestoneMock.mock.calls).toEqual([
    [collector, 'component.first_rendered'],
  ]);
});
