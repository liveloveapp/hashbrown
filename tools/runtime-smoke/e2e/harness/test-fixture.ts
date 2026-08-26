import { EventType } from '@ag-ui/core';
import { test as base, expect as playwrightExpect } from '@playwright/test';
import { type AimockHandle, startAimock } from '@hashbrownai/testing/aimock';
import type { ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { runAimockWorker } from './aimock-worker';

const emptyFixturePath = resolve(__dirname, '../fixtures/empty.json');

function isTerminalEventFrame(chunk: unknown): boolean {
  if (typeof chunk !== 'string') {
    return false;
  }

  return chunk.split(/\r?\n/).some((line) => {
    if (!line.startsWith('data:')) {
      return false;
    }

    try {
      const event = JSON.parse(line.slice('data:'.length).trim()) as {
        readonly type?: unknown;
      };

      return (
        event.type === EventType.RUN_FINISHED ||
        event.type === EventType.RUN_ERROR
      );
    } catch {
      return false;
    }
  });
}

function endResponseAfterTerminalEvent(response: ServerResponse): void {
  const originalWrite = response.write;
  const originalEnd = response.end;
  let ended = false;
  const endResponse = (...args: unknown[]): ServerResponse => {
    if (ended) {
      return response;
    }

    ended = true;
    return Reflect.apply(originalEnd, response, args) as ServerResponse;
  };

  response.end = endResponse as typeof response.end;
  response.write = ((chunk: unknown, ...args: unknown[]) => {
    const isTerminal = isTerminalEventFrame(chunk);
    // Let EOF release the terminal event after the browser completes the fetch.
    const outputChunk =
      isTerminal && typeof chunk === 'string'
        ? chunk.replace(/\r?\n\r?\n$/, '\n')
        : chunk;
    const result = Reflect.apply(originalWrite, response, [
      outputChunk,
      ...args,
    ]) as boolean;
    if (isTerminal) {
      endResponse();
    }

    return result;
  }) as typeof response.write;
}

async function startBrowserAimock(): Promise<AimockHandle> {
  const handle = await startAimock({ fixturePath: emptyFixturePath });
  const handleRequest = handle.aguiMock.handleRequest.bind(handle.aguiMock);
  handle.aguiMock.handleRequest = async (request, response, pathname) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    endResponseAfterTerminalEvent(response);

    return handleRequest(request, response, pathname);
  };

  return handle;
}

/** Worker-scoped fixtures shared by runtime smoke browser tests. */
export interface RuntimeSmokeWorkerFixtures {
  /** Dynamically allocated aimock server owned by the current worker. */
  readonly aimock: AimockHandle;
}

/** Playwright test extended with the worker-scoped runtime smoke fixtures. */
export const test = base.extend<object, RuntimeSmokeWorkerFixtures>({
  aimock: [
    async ({ playwright }, use) => {
      void playwright;
      await runAimockWorker(startBrowserAimock, use);
    },
    { scope: 'worker' },
  ],
});

/** Playwright assertions for runtime smoke browser tests. */
export const expect = playwrightExpect;
