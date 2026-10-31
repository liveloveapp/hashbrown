import { normalizeWireEvents } from './normalize.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { normalizeExecution } from '../python/normalize.mjs';
import {
  captureScenario,
  captureClientRoundTrip,
  parseEvents,
} from '../python/capture.mjs';
import {
  captureApproval,
  captureIsolation,
  captureProtocol,
  directory,
} from './capture.mjs';
import { startPydanticHost } from './controller.mjs';

/** Normalize generated native/wire history envelopes, preserving contents and call IDs. */
function normalize(execution) {
  const result = normalizeExecution(execution);
  const ids = new Map();
  const uuid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
  const identity = (value) => {
    if (typeof value !== 'string' || !uuid.test(value)) return value;
    if (!ids.has(value)) ids.set(value, `generated-${ids.size + 1}`);
    return ids.get(value);
  };
  const native = (message) => {
    const own = message.metadata?.['__pydantic_ai__'];
    if (!own?.ui_message_id) return message;
    return {
      ...message,
      metadata: {
        ...message.metadata,
        __pydantic_ai__: { ...own, ui_message_id: identity(own.ui_message_id) },
      },
    };
  };
  const wire = (messages) =>
    messages?.map((message) => ({ ...message, id: identity(message.id) }));
  return {
    ...result,
    history: result.history.map(native),
    modelRequests: result.modelRequests.map((messages) => messages.map(native)),
    ...(result.wireHistory ? { wireHistory: wire(result.wireHistory) } : {}),
    ...(result.requests
      ? {
          requests: result.requests.map((request) => ({
            ...request,
            messages: wire(request.messages),
          })),
        }
      : {}),
  };
}

test('history normalization preserves application IDs, typed outcomes and payloads', () => {
  const input = {
    history: [],
    modelRequests: [],
    wireHistory: [
      {
        id: 'application',
        role: 'tool',
        toolCallId: 'call',
        content: 'a',
        metadata: { 'hashbrown.tool': { v: 1, outcome: 'denied' } },
      },
    ],
  };

  const result = normalize(input);

  assert.deepEqual(result, input);
  assert.notEqual(result, input);
});

test('retained recipe captures match fresh installed-wheel producer execution', async () => {
  const host = await startPydanticHost();

  try {
    const captures = [];
    for (const scenario of [
      'streaming',
      'server-tool',
      'failure',
      'cancel-default',
      'cancel-v1',
      'server-same-name',
      'disconnect',
    ])
      captures.push([scenario, await captureScenario(host, scenario)]);
    captures.push(
      ...Object.entries(await captureClientRoundTrip(host)),
      ...Object.entries(await captureApproval(host, true)),
      ...Object.entries(await captureApproval(host, false)),
      ['protocol', await captureProtocol(host)],
      ...Object.entries(await captureIsolation(host)),
    );
    for (const [scenario, fresh] of captures) {
      const bytes = await readFile(new URL(`${scenario}.sse`, directory));
      const read = async (extension) =>
        JSON.parse(
          await readFile(
            new URL(`${scenario}.${extension}.json`, directory),
            'utf8',
          ),
        );
      const parsed = await read('events');

      assert.deepEqual(parseEvents(bytes), parsed);
      assert.deepEqual(
        normalizeWireEvents(parseEvents(fresh.bytes)),
        normalizeWireEvents(parsed),
        scenario,
      );
      assert.deepEqual(
        normalize({ history: [], modelRequests: [], requests: [fresh.body] }),
        normalize({
          history: [],
          modelRequests: [],
          requests: [await read('request')],
        }),
        scenario,
      );
      assert.deepEqual(
        normalize(fresh.observations),
        normalize(await read('execution')),
        scenario,
      );
      if (fresh.liveObservations)
        assert.deepEqual(fresh.liveObservations, await read('live'));
    }
  } finally {
    await host.stop();
  }
});

test('wire normalization cannot conceal changed application activity identities or outcome payloads', () => {
  const events = [
    {
      type: 'ACTIVITY_SNAPSHOT',
      messageId: 'application-progress',
      content: { progress: 0 },
    },
  ];

  const original = normalizeWireEvents(events);
  const changed = normalizeWireEvents([
    { ...events[0], messageId: 'wrong-application-progress' },
  ]);

  assert.notDeepEqual(original, changed);
  assert.equal(original[0].messageId, 'application-progress');
  assert.deepEqual(original[0].content, events[0].content);
});
