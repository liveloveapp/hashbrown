import { EventType, type RunAgentInput } from '@ag-ui/core';
import { expect, test } from 'vitest';
import { createStructuredListEvents } from '../../src/tools/docs-structured-fixtures';

const input: RunAgentInput = {
  threadId: 'list',
  runId: 'draft',
  messages: [],
  tools: [],
  context: [],
  state: {},
};

test('structured fixture streams separately completed items before settling the run', () => {
  const events = createStructuredListEvents(input, 'success');

  const chunks = events.flatMap((event) =>
    event.type === EventType.TEXT_MESSAGE_CONTENT ? [event.delta] : [],
  );

  expect(chunks).toHaveLength(4);
  expect(JSON.parse(chunks.join(''))).toEqual({
    items: [
      { name: 'Apples', quantity: 2 },
      { name: 'Bread', quantity: 1 },
    ],
  });
  expect(events.at(-1)).toEqual({
    type: EventType.RUN_FINISHED,
    threadId: 'list',
    runId: 'draft',
  });
  expect(chunks[1]).toBe('{"name":"Apples","quantity":2}');
});

test('failed fixture emits valid draft data before the terminal error', () => {
  const events = createStructuredListEvents(input, 'failed');

  const chunks = events.flatMap((event) =>
    event.type === EventType.TEXT_MESSAGE_CONTENT ? [event.delta] : [],
  );

  expect(JSON.parse(chunks.join('')).items).toHaveLength(2);
  expect(events.at(-1)?.type).toBe(EventType.RUN_ERROR);
  expect(events.some((event) => event.type === EventType.RUN_FINISHED)).toBe(
    false,
  );
});

test('empty replacement has no assistant message to reuse', () => {
  const events = createStructuredListEvents(input, 'empty');

  const types = events.map((event) => event.type);

  expect(types).toEqual([EventType.RUN_STARTED, EventType.RUN_FINISHED]);
});

test('invalid fixture is structurally valid but violates application quantity rules', () => {
  const events = createStructuredListEvents(input, 'invalid');

  const chunks = events.flatMap((event) =>
    event.type === EventType.TEXT_MESSAGE_CONTENT ? [event.delta] : [],
  );

  expect(JSON.parse(chunks.join('')).items[0].quantity).toBe(0);
});

test('truncated fixture carries the same finish metadata as the provider adapters', () => {
  const events = createStructuredListEvents(input, 'truncated');

  const finished = events.at(-1);

  expect(finished).toMatchObject({
    type: EventType.RUN_FINISHED,
    metadata: { hashbrown: { finishReason: 'length' } },
  });
});
