import type { RunAgentInput } from '@ag-ui/core';
import type { Decision } from '@hashbrownai/core';
import { expect, test } from 'vitest';
import {
  createPredictionEvents,
  createRecipeTextEvents,
  createSelectionResponse,
} from '../../src/tools/docs-recipe-fixtures';

const input = {
  threadId: 'packing',
  runId: 'run',
  tools: [],
  context: [],
  state: {},
  messages: [
    {
      id: 'user',
      role: 'user',
      content: JSON.stringify({
        contextId: 'city-1',
        context: 'city',
        currentItemIds: [],
      }),
    },
  ],
} as unknown as RunAgentInput;

test('prediction recording echoes the actual request context and trusted catalog IDs', () => {
  const events = createPredictionEvents(input, 'success');

  const text = events
    .flatMap((event) =>
      event.type === 'TEXT_MESSAGE_CONTENT' ? [event.delta] : [],
    )
    .join('');

  expect(JSON.parse(text)).toMatchObject({
    contextId: 'city-1',
    suggestions: [{ itemId: 'passport' }, { itemId: 'charger' }],
  });
});

test('prediction empty result is a completed valid response rather than a reused answer', () => {
  const events = createPredictionEvents(input, 'empty');

  const text = events
    .flatMap((event) =>
      event.type === 'TEXT_MESSAGE_CONTENT' ? [event.delta] : [],
    )
    .join('');

  expect(JSON.parse(text)).toEqual({ contextId: 'city-1', suggestions: [] });
  expect(events.at(-1)?.type).toBe('RUN_FINISHED');
});

test('text failure preserves streamed text but never emits a success event', () => {
  const events = createRecipeTextEvents(input, 'Hello **world**', 'failed');

  const text = events
    .flatMap((event) =>
      event.type === 'TEXT_MESSAGE_CONTENT' ? [event.delta] : [],
    )
    .join('');

  expect(text).toBe('Hello **world**');
  expect(events.at(-1)?.type).toBe('RUN_ERROR');
  expect(events.some((event) => event.type === 'RUN_FINISHED')).toBe(false);
});

test('truncation uses the provider finish metadata envelope', () => {
  const events = createPredictionEvents(input, 'truncated');

  const terminal = events.at(-1);

  expect(terminal).toMatchObject({
    type: 'RUN_FINISHED',
    metadata: { hashbrown: { finishReason: 'length' } },
  });
});

test('selection response follows the actual compiled question IDs and probability metadata', () => {
  const request: Decision.Request = {
    state: 'Show every item',
    questions: {
      pick: {
        type: 'choice',
        instructions: 'Choose',
        options: { summary: 'Counts', items: 'Names' },
      },
    },
  };

  const response = createSelectionResponse(request, 'items', 0.9);

  expect(response).toEqual({
    kind: 'hashbrown.decision',
    version: 1,
    value: { pick: 'items' },
    meta: {
      pick: {
        confidence: 0.9,
        probabilities: { summary: expect.closeTo(0.1), items: 0.9 },
      },
    },
  });
});
