import { expect, test } from 'vitest';
import type { AGUIEvent, RunAgentInput } from '@ag-ui/core';
import { createWorkbenchAgentStream } from '../examples/quickstart/server/workbench-agent';
import { pinWorkbenchInput } from '../examples/quickstart/server/workbench-app';
const input = {
  threadId: 't',
  runId: 'r',
  state: {},
  tools: [],
  context: [],
  forwardedProps: {},
  messages: [{ id: 'u', role: 'user', content: 'Outline the demo' }],
} as RunAgentInput;
const collect = async (events: AsyncIterable<AGUIEvent>) => {
  const values = [];
  for await (const event of events) values.push(event);
  return values;
};
const delegate = async function* () {
  yield { type: 'CUSTOM', name: 'delegated', value: true } as AGUIEvent;
};
const response = (route = 'outline', confidence = 0.9) => ({
  kind: 'hashbrown.decision',
  version: 1,
  value: { route },
  meta: { route: { confidence, probabilities: { [route]: confidence } } },
});

test('pins JSON authoring schema and browser tool policy independently of client input', () => {
  const parser = pinWorkbenchInput(input, 'json-parser');
  const forms = pinWorkbenchInput(input, 'natural-forms');

  expect(parser.tools).toEqual([]);
  expect(forms.tools.map((tool) => tool.name)).toEqual(['readContext']);
  expect(parser.forwardedProps).toMatchObject({
    hashbrown: { ui: false, responseSchema: { type: 'object' } },
  });
  expect(forms.messages[0]).toMatchObject({
    content: expect.stringContaining('exactly once'),
  });
  expect(forms.messages[0]).toMatchObject({
    content: expect.stringContaining('including user edits'),
  });
});

test('agent decodes real decision envelopes and returns whole application handler text and safe trace', async () => {
  const stream = createWorkbenchAgentStream({
    delegate,
    classify: async () => response(),
  });

  const events = await collect(
    stream(input, new AbortController().signal, 'agent-decisions'),
  );

  expect(events.find((event) => event.type === 'CUSTOM')).toMatchObject({
    name: 'workbench.agent-decision',
    value: { value: { route: 'outline' }, handler: 'outline', fallback: null },
  });
  expect(
    events.filter((event) => event.type === 'TEXT_MESSAGE_CONTENT'),
  ).toHaveLength(1);
});

test('agent clarifies invalid low unavailable decisions and preserves delegated streams', async () => {
  for (const classify of [
    undefined,
    async () => ({}),
    async () => response('record', 0.74),
  ]) {
    const events = await collect(
      createWorkbenchAgentStream({ delegate, classify })(
        input,
        new AbortController().signal,
        'agent-decisions',
      ),
    );
    expect(events.find((event) => event.type === 'CUSTOM')).toMatchObject({
      value: { handler: 'clarify' },
    });
  }
  expect(
    await collect(
      createWorkbenchAgentStream({ delegate })(
        input,
        new AbortController().signal,
        'message-history',
      ),
    ),
  ).toEqual([{ type: 'CUSTOM', name: 'delegated', value: true }]);
});

test('unexpected classifier failures propagate while cancellation suppresses late output', async () => {
  const controller = new AbortController();
  const failure = createWorkbenchAgentStream({
    delegate,
    classify: async () => {
      throw new Error('bug');
    },
  });
  await expect(
    collect(failure(input, controller.signal, 'agent-decisions')),
  ).rejects.toThrow('bug');
  const cancelled = createWorkbenchAgentStream({
    delegate,
    classify: async () => {
      controller.abort();
      return response();
    },
  });
  const events = await collect(
    cancelled(input, controller.signal, 'agent-decisions'),
  );
  expect(
    events.filter((event) => event.type === 'TEXT_MESSAGE_CONTENT'),
  ).toHaveLength(0);
});

test('sends only production-reference lessons to the separate server', () => {
  const loopback = () => pinWorkbenchInput(input, 'server-threads');
  const reference = () => pinWorkbenchInput(input, 'production-recovery');

  const thrown = [loopback, reference].map((pin) => {
    try {
      pin();
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  });

  expect(thrown[0]).not.toBe('Use the separate production reference server.');
  expect(thrown[1]).toBe('Use the separate production reference server.');
});
