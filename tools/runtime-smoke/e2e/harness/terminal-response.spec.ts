import { EventType } from '@ag-ui/core';
import type { ServerResponse } from 'node:http';
import {
  endResponseAfterTerminalEvent,
  terminalEventMatchesRun,
} from './terminal-response';

interface FakeResponse {
  readonly response: ServerResponse;
  readonly writes: unknown[];
  readonly endCalls: unknown[][];
}

function createFakeResponse(): FakeResponse {
  const writes: unknown[] = [];
  const endCalls: unknown[][] = [];
  const response = {
    write(chunk: unknown) {
      writes.push(chunk);
      return true;
    },
    end(...args: unknown[]) {
      endCalls.push(args);
      return response;
    },
  } as unknown as ServerResponse;

  return { response, writes, endCalls };
}

test('forwards a complete terminal SSE frame before closing exactly once', () => {
  const fake = createFakeResponse();
  const terminalEvents: unknown[] = [];
  const terminalFrame =
    'data: {"type":"RUN_FINISHED","threadId":"thread","runId":"run"}\n\n';
  endResponseAfterTerminalEvent(fake.response, (event) => {
    terminalEvents.push(event);
  });

  const writeResult = fake.response.write(terminalFrame);
  fake.response.end();

  expect(writeResult).toBe(true);
  expect(fake.writes).toEqual([]);
  expect(fake.endCalls).toEqual([[terminalFrame]]);
  expect(terminalEvents).toEqual([
    { type: 'RUN_FINISHED', threadId: 'thread', runId: 'run' },
  ]);
});

test('does not close for an incomplete terminal SSE frame', () => {
  const fake = createFakeResponse();
  const incompleteTerminalFrame =
    'data: {"type":"RUN_FINISHED","threadId":"thread","runId":"run"}\n';
  endResponseAfterTerminalEvent(fake.response);

  fake.response.write(incompleteTerminalFrame);

  expect(fake.writes).toEqual([incompleteTerminalFrame]);
  expect(fake.endCalls).toEqual([]);
});

test('parses all data lines as one SSE payload before detecting a terminal', () => {
  const fake = createFakeResponse();
  const invalidMultilineFrame = [
    'data: {"type":"RUN_FINISHED","threadId":"thread","runId":"run"}',
    'data: invalid continuation',
    '',
    '',
  ].join('\n');
  endResponseAfterTerminalEvent(fake.response);

  fake.response.write(invalidMultilineFrame);

  expect(fake.writes).toEqual([invalidMultilineFrame]);
  expect(fake.endCalls).toEqual([]);
});

test('leaves a nonterminal SSE response open until the server ends it', () => {
  const fake = createFakeResponse();
  const contentFrame =
    'data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"message","delta":"hello"}\n\n';
  endResponseAfterTerminalEvent(fake.response);

  fake.response.write(contentFrame);

  expect(fake.writes).toEqual([contentFrame]);
  expect(fake.endCalls).toEqual([]);

  fake.response.end('done');

  expect(fake.endCalls).toEqual([['done']]);
});

test('matches only a terminal accepted for the active run identity', () => {
  const identity = { threadId: 'thread', runId: 'run' };

  expect(
    terminalEventMatchesRun(
      {
        type: EventType.RUN_FINISHED,
        threadId: 'thread',
        runId: 'run',
      },
      identity,
    ),
  ).toBe(true);
  expect(
    terminalEventMatchesRun(
      {
        type: EventType.RUN_FINISHED,
        threadId: 'thread',
        runId: 'other',
      },
      identity,
    ),
  ).toBe(false);
  expect(terminalEventMatchesRun({ type: EventType.RUN_ERROR }, identity)).toBe(
    true,
  );
});
