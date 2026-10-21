import { createChatRuntime } from '../chat-runtime';
import {
  createDevelopmentCollector,
  getDevelopmentCollectionDiagnostics,
  reportMilestone,
  setDevelopmentCollectionEnabled,
} from './runtime';
import { installBrowserStubs } from './testing/browser-stubs';
import type { DevelopmentCollectorOptions, RuntimeEvent } from './types';

const NOW = Date.parse('2026-10-21T12:00:00.000Z');

type Sent = { schemaVersion: number; events: RuntimeEvent[] };

const OPTIONS: DevelopmentCollectorOptions = {
  integration: 'react',
  packageName: '@hashbrownai/react',
  packageVersion: '0.7.0',
  isDevelopment: () => true,
};

const ZERO = { acknowledged: 0, failures: 0, discarded: 0, pending: 0 };

function acknowledge(init: RequestInit): Response {
  const body = JSON.parse(String(init.body)) as Sent;
  return new Response(
    JSON.stringify({
      schemaVersion: 1,
      events: body.events.map((event) => ({
        eventId: event.eventId,
        disposition: 'accepted',
      })),
    }),
  );
}

function setGlobal(name: string, value: unknown): () => void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
  return () => {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else delete (globalThis as Record<string, unknown>)[name];
  };
}

/**
 * Installs fake timers and a fetch spy and, unless `browser` is false, the
 * browser globals an allowed development page has.
 */
function setup(
  options: {
    browser?: boolean;
    webdriver?: boolean;
    windowOptOut?: boolean;
    storageOptOut?: boolean;
  } = {},
) {
  jest.useFakeTimers({
    doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
  });
  jest.setSystemTime(NOW);
  const fetch = jest.fn(async (_url: string, init: RequestInit) =>
    acknowledge(init),
  );
  const restorers = [setGlobal('fetch', fetch)];
  if (options.browser !== false) {
    const stubs = installBrowserStubs();
    if (options.storageOptOut)
      stubs.storage.set('HASHBROWN_TELEMETRY_DISABLED', '1');
    if (options.windowOptOut)
      (
        globalThis as unknown as {
          window: { __HASHBROWN_TELEMETRY_DISABLED__?: boolean };
        }
      ).window.__HASHBROWN_TELEMETRY_DISABLED__ = true;
    restorers.push(
      stubs.restore,
      setGlobal('document', {}),
      setGlobal('navigator', { webdriver: options.webdriver ?? false }),
    );
  }
  const runtime = createChatRuntime({ system: 'test' });
  const sent = (index = 0): Sent =>
    JSON.parse(String(fetch.mock.calls[index][1].body)) as Sent;
  return {
    runtime,
    fetch,
    sent,
    restore: () => {
      setDevelopmentCollectionEnabled(false);
      setDevelopmentCollectionEnabled(true);
      restorers.reverse().forEach((restore) => restore());
      jest.useRealTimers();
    },
  };
}

test('the collector is inert without a window', async () => {
  const { runtime, fetch, restore } = setup({ browser: false });
  try {
    const collector = createDevelopmentCollector(OPTIONS);

    const detach = collector.attach(runtime);
    reportMilestone(collector, 'component.first_rendered');
    await jest.advanceTimersByTimeAsync(60_000);

    expect(fetch).not.toHaveBeenCalled();
    expect(getDevelopmentCollectionDiagnostics()).toEqual(ZERO);
    detach();
  } finally {
    restore();
  }
});

test('the collector is inert when webdriver is true', async () => {
  const { runtime, fetch, restore } = setup({ webdriver: true });
  try {
    const collector = createDevelopmentCollector(OPTIONS);

    collector.attach(runtime);
    reportMilestone(collector, 'component.first_rendered');
    await jest.advanceTimersByTimeAsync(60_000);

    expect(fetch).not.toHaveBeenCalled();
    expect(getDevelopmentCollectionDiagnostics()).toEqual(ZERO);
  } finally {
    restore();
  }
});

test('the collector is inert outside development mode', async () => {
  const { runtime, fetch, restore } = setup();
  try {
    const collector = createDevelopmentCollector({
      ...OPTIONS,
      isDevelopment: () => false,
    });

    collector.attach(runtime);
    reportMilestone(collector, 'component.first_rendered');
    await jest.advanceTimersByTimeAsync(60_000);

    expect(fetch).not.toHaveBeenCalled();
    expect(getDevelopmentCollectionDiagnostics()).toEqual(ZERO);
  } finally {
    restore();
  }
});

test('the localStorage and window opt-outs win', async () => {
  const optOuts = [{ storageOptOut: true }, { windowOptOut: true }];
  const calls: number[] = [];

  for (const optOut of optOuts) {
    const { runtime, fetch, restore } = setup(optOut);
    try {
      const collector = createDevelopmentCollector(OPTIONS);
      collector.attach(runtime);
      reportMilestone(collector, 'component.first_rendered');
      await jest.advanceTimersByTimeAsync(60_000);
      calls.push(fetch.mock.calls.length);
    } finally {
      restore();
    }
  }

  expect(calls).toEqual([0, 0]);
});

test('an application switch returning false turns the collector off', async () => {
  const { runtime, fetch, restore } = setup();
  try {
    const collector = createDevelopmentCollector({
      ...OPTIONS,
      enabled: () => false,
    });

    collector.attach(runtime);
    await jest.advanceTimersByTimeAsync(60_000);

    expect(fetch).not.toHaveBeenCalled();
  } finally {
    restore();
  }
});

test('setDevelopmentCollectionEnabled(false) stops collection and clears pending work', async () => {
  const { runtime, fetch, restore } = setup();
  try {
    const collector = createDevelopmentCollector(OPTIONS);
    collector.attach(runtime);
    const before = getDevelopmentCollectionDiagnostics().pending;

    setDevelopmentCollectionEnabled(false);
    reportMilestone(collector, 'component.first_rendered');
    await jest.advanceTimersByTimeAsync(60_000);

    expect(before).toBe(1);
    expect(getDevelopmentCollectionDiagnostics()).toEqual(ZERO);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    restore();
  }
});

test('an allowed browser reports the session start and milestones', async () => {
  const { runtime, fetch, sent, restore } = setup();
  try {
    const collector = createDevelopmentCollector(OPTIONS);

    collector.attach(runtime);
    reportMilestone(collector, 'component.first_rendered');
    await jest.advanceTimersByTimeAsync(0);

    expect(fetch).toHaveBeenCalledTimes(1);
    const events = sent().events;
    expect(events.map((event) => event.kind)).toEqual([
      'runtime.session_started',
      'component.first_rendered',
    ]);
    for (const event of events) {
      expect(event.properties['transport']).toBe('http');
      expect(event.properties['packageName']).toBe('@hashbrownai/react');
      expect(event.installationToken).toBeUndefined();
    }
    expect(getDevelopmentCollectionDiagnostics()).toMatchObject({
      acknowledged: 2,
      pending: 0,
    });
  } finally {
    restore();
  }
});

test('a milestone detail transport overrides the bound transport', async () => {
  const { runtime, sent, restore } = setup();
  try {
    const collector = createDevelopmentCollector(OPTIONS);
    collector.attach(runtime);

    reportMilestone(collector, 'tool.first_call_executed', {
      transport: 'local',
    });
    await jest.advanceTimersByTimeAsync(0);

    expect(
      sent().events.map((event) => [event.kind, event.properties['transport']]),
    ).toEqual([
      ['runtime.session_started', 'http'],
      ['tool.first_call_executed', 'local'],
    ]);
  } finally {
    restore();
  }
});

test('a disposed collector sends nothing more', async () => {
  const { runtime, fetch, restore } = setup();
  try {
    const collector = createDevelopmentCollector(OPTIONS);
    collector.attach(runtime);

    collector.dispose();
    reportMilestone(collector, 'component.first_rendered');
    collector.attach(runtime);
    await jest.advanceTimersByTimeAsync(60_000);

    expect(fetch).not.toHaveBeenCalled();
    expect(getDevelopmentCollectionDiagnostics().pending).toBe(0);
  } finally {
    restore();
  }
});

test('createDevelopmentCollector rejects a mismatched package name', async () => {
  const { runtime, fetch, restore } = setup();
  try {
    const collector = createDevelopmentCollector({
      ...OPTIONS,
      packageName: '@hashbrownai/angular',
    });

    collector.attach(runtime);
    reportMilestone(collector, 'component.first_rendered');
    await jest.advanceTimersByTimeAsync(60_000);

    expect(fetch).not.toHaveBeenCalled();
    expect(getDevelopmentCollectionDiagnostics()).toEqual(ZERO);
  } finally {
    restore();
  }
});

test('createDevelopmentCollector rejects an invalid package version', async () => {
  const { runtime, fetch, restore } = setup();
  try {
    const collector = createDevelopmentCollector({
      ...OPTIONS,
      packageVersion: 'latest',
    });

    collector.attach(runtime);
    await jest.advanceTimersByTimeAsync(60_000);

    expect(fetch).not.toHaveBeenCalled();
  } finally {
    restore();
  }
});

test('attaching an unknown runtime and a throwing switch never throw', () => {
  const { restore } = setup();
  try {
    const collector = createDevelopmentCollector({
      ...OPTIONS,
      enabled: () => {
        throw new Error('boom');
      },
    });

    const attach = () => collector.attach({ resume: () => undefined })();
    const report = () => reportMilestone(collector, 'component.first_rendered');

    expect(attach).not.toThrow();
    expect(report).not.toThrow();
  } finally {
    restore();
  }
});
