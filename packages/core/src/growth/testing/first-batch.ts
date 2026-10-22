import { createChatRuntime } from '../../chat-runtime';
import {
  createDevelopmentCollector,
  setDevelopmentCollectionEnabled,
} from '../runtime';
import type { RuntimeEvent } from '../types';
import { installBrowserStubs } from './browser-stubs';

type Sent = { schemaVersion: number; events: RuntimeEvent[] };

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
 * Attaches a React development collector to a fresh runtime in an allowed
 * development browser, with fake timers and an acknowledging fetch, and
 * returns the events of the first request. Every global is restored after.
 *
 * @returns The events the first request carried.
 */
export async function sendFirstBatch(): Promise<RuntimeEvent[]> {
  jest.useFakeTimers({
    doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
  });
  const fetch = jest.fn(async (_url: string, init: RequestInit) => {
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
  });
  const stubs = installBrowserStubs();
  const restorers = [
    setGlobal('fetch', fetch),
    stubs.restore,
    setGlobal('document', {}),
    setGlobal('navigator', { webdriver: false, userAgent: 'Mozilla/5.0' }),
  ];
  try {
    const runtime = createChatRuntime({ system: 'test' });
    createDevelopmentCollector({
      integration: 'react',
      packageName: '@hashbrownai/react',
      packageVersion: '0.8.0',
      isDevelopment: () => true,
    }).attach(runtime);
    await jest.advanceTimersByTimeAsync(0);
    return (JSON.parse(String(fetch.mock.calls[0][1].body)) as Sent).events;
  } finally {
    setDevelopmentCollectionEnabled(false);
    setDevelopmentCollectionEnabled(true);
    restorers.reverse().forEach((restore) => restore());
    jest.useRealTimers();
  }
}
