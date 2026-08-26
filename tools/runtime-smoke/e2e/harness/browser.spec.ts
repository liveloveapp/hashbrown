import type { ConsoleMessage, Page, Request, Response } from '@playwright/test';
import { installBrowserHygiene } from './browser';

interface FakePage {
  readonly page: Page;
  emit(event: string, value: unknown): void;
}

function createFakePage(): FakePage {
  const listeners = new Map<string, Array<(value: unknown) => void>>();
  const page = {
    on(event: string, listener: (value: unknown) => void) {
      const eventListeners = listeners.get(event) ?? [];
      eventListeners.push(listener);
      listeners.set(event, eventListeners);
      return page;
    },
  } as unknown as Page;

  return {
    page,
    emit(event, value) {
      for (const listener of listeners.get(event) ?? []) {
        listener(value);
      }
    },
  };
}

function createRequest(errorText = 'net::ERR_ABORTED'): Request {
  return {
    method: () => 'POST',
    url: () => 'http://127.0.0.1:4100/run',
    failure: () => ({ errorText }),
  } as Request;
}

function createResponse(request: Request): Response {
  return {
    status: () => 503,
    request: () => request,
    url: () => request.url(),
  } as Response;
}

function createConsoleMessage(): ConsoleMessage {
  return {
    type: () => 'error',
    text: () =>
      'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
    location: () => ({
      url: 'http://127.0.0.1:4100/run',
      lineNumber: 0,
      columnNumber: 0,
    }),
  } as ConsoleMessage;
}

test('consumes each exact browser hygiene allowance once', () => {
  const fakePage = createFakePage();
  const request = createRequest();
  const response = createResponse(request);
  const consoleMessage = createConsoleMessage();
  const hygiene = installBrowserHygiene(fakePage.page, {
    requestFailureAllowances: [
      {
        reason: 'cancelled run',
        matches: (candidate) => candidate === request,
      },
    ],
    httpErrorAllowances: [
      {
        reason: 'intentional 503',
        matches: (candidate) => candidate === response,
      },
    ],
    consoleErrorAllowances: [
      {
        reason: 'intentional 503 browser report',
        matches: (candidate) => candidate === consoleMessage,
      },
    ],
  });

  fakePage.emit('requestfailed', request);
  fakePage.emit('response', response);
  fakePage.emit('console', consoleMessage);

  expect(() => hygiene.assertClean()).not.toThrow();
});

test('reports a browser hygiene allowance that was not consumed', () => {
  const fakePage = createFakePage();
  const hygiene = installBrowserHygiene(fakePage.page, {
    requestFailureAllowances: [
      {
        reason: 'cancelled run',
        matches: () => true,
      },
    ],
  });

  const assertClean = () => hygiene.assertClean();

  expect(assertClean).toThrow(
    'Expected request failure allowance "cancelled run" exactly once, observed 0',
  );
});

test('reports a browser hygiene allowance consumed more than once', () => {
  const fakePage = createFakePage();
  const request = createRequest();
  const hygiene = installBrowserHygiene(fakePage.page, {
    requestFailureAllowances: [
      {
        reason: 'cancelled run',
        matches: () => true,
      },
    ],
  });

  fakePage.emit('requestfailed', request);
  fakePage.emit('requestfailed', request);
  const assertClean = () => hygiene.assertClean();

  expect(assertClean).toThrow(
    'Expected request failure allowance "cancelled run" exactly once, observed 2',
  );
});
