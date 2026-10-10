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

test('consumes each exact browser hygiene allowance once', async () => {
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

  await expect(hygiene.assertClean()).resolves.toBeUndefined();
});

test('reports a browser hygiene allowance that was not consumed', async () => {
  const fakePage = createFakePage();
  const hygiene = installBrowserHygiene(fakePage.page, {
    requestFailureAllowances: [
      {
        reason: 'cancelled run',
        matches: () => true,
      },
    ],
  });

  await expect(hygiene.assertClean()).rejects.toThrow(
    'Expected request failure allowance "cancelled run" exactly once, observed 0',
  );
});

test('reports a browser hygiene allowance consumed more than once', async () => {
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
  await expect(hygiene.assertClean()).rejects.toThrow(
    'Expected request failure allowance "cancelled run" exactly once, observed 2',
  );
});

test('rejects an ambiguous allowance match before a broad-only event', async () => {
  const fakePage = createFakePage();
  const cancelledRequest = createRequest();
  const otherFailure = createRequest('net::ERR_FAILED');
  const hygiene = installBrowserHygiene(fakePage.page, {
    requestFailureAllowances: [
      {
        reason: 'all POST failures',
        matches: (request) => request.method() === 'POST',
      },
      {
        reason: 'cancelled run',
        matches: (request) =>
          request.failure()?.errorText === 'net::ERR_ABORTED',
      },
    ],
  });

  fakePage.emit('requestfailed', cancelledRequest);
  fakePage.emit('requestfailed', otherFailure);
  await expect(hygiene.assertClean()).rejects.toThrow(
    'Ambiguous request failure allowance match: "all POST failures", "cancelled run"',
  );
});

test('rejects an ambiguous allowance match after a broad-only event', async () => {
  const fakePage = createFakePage();
  const cancelledRequest = createRequest();
  const otherFailure = createRequest('net::ERR_FAILED');
  const hygiene = installBrowserHygiene(fakePage.page, {
    requestFailureAllowances: [
      {
        reason: 'all POST failures',
        matches: (request) => request.method() === 'POST',
      },
      {
        reason: 'cancelled run',
        matches: (request) =>
          request.failure()?.errorText === 'net::ERR_ABORTED',
      },
    ],
  });

  fakePage.emit('requestfailed', otherFailure);
  fakePage.emit('requestfailed', cancelledRequest);
  await expect(hygiene.assertClean()).rejects.toThrow(
    'Ambiguous request failure allowance match: "all POST failures", "cancelled run"',
  );
});

test('reports a completely unmatched browser event as unexpected', async () => {
  const fakePage = createFakePage();
  const unmatchedRequest = createRequest('net::ERR_FAILED');
  const hygiene = installBrowserHygiene(fakePage.page, {
    requestFailureAllowances: [
      {
        reason: 'cancelled run',
        matches: (request) =>
          request.failure()?.errorText === 'net::ERR_ABORTED',
      },
    ],
  });

  fakePage.emit('requestfailed', unmatchedRequest);
  await expect(hygiene.assertClean()).rejects.toThrow(
    'Request failed: POST http://127.0.0.1:4100/run (net::ERR_FAILED)',
  );
});

test('ignores only a request failure accepted by the terminal matcher', async () => {
  const fakePage = createFakePage();
  const terminalAbort = createRequest();
  const unexpectedAbort = createRequest();
  const hygiene = installBrowserHygiene(
    fakePage.page,
    {},
    (request) => request === terminalAbort,
  );

  fakePage.emit('requestfailed', terminalAbort);
  fakePage.emit('requestfailed', unexpectedAbort);
  await expect(hygiene.assertClean()).rejects.toThrow(
    'Request failed: POST http://127.0.0.1:4100/run (net::ERR_ABORTED)',
  );
});

test('waits for a pending POST failure before asserting hygiene', async () => {
  const fakePage = createFakePage();
  const request = createRequest('net::ERR_FAILED');
  const hygiene = installBrowserHygiene(fakePage.page);
  fakePage.emit('request', request);

  const assertion = hygiene.assertClean();
  await Promise.resolve();
  fakePage.emit('requestfailed', request);

  await expect(assertion).rejects.toThrow(
    'Request failed: POST http://127.0.0.1:4100/run (net::ERR_FAILED)',
  );
});
