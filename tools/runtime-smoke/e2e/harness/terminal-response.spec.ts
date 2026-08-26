import type { ServerResponse } from 'node:http';
import { endResponseAfterTerminalEvent } from './terminal-response';

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
  let terminalCalls = 0;
  const terminalFrame =
    'data: {"type":"RUN_FINISHED","threadId":"thread","runId":"run"}\n\n';
  endResponseAfterTerminalEvent(fake.response, () => {
    terminalCalls += 1;
  });

  const writeResult = fake.response.write(terminalFrame);
  fake.response.end();

  expect(writeResult).toBe(true);
  expect(fake.writes).toEqual([]);
  expect(fake.endCalls).toEqual([[terminalFrame]]);
  expect(terminalCalls).toBe(1);
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
