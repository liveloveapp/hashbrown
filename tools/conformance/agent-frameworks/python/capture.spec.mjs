import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { normalizeEvents, normalizeExecution } from './normalize.mjs';
import { captureClientRoundTrip, captureScenario, parseEvents } from './capture.mjs';
import { startPydanticHost } from './controller.mjs';

test('normalization changes generated envelope identities and timestamps only', () => {
  const input = [{ type: 'TEXT_MESSAGE_START', messageId: 'random', timestamp: 10 }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'random', delta: 'random', timestamp: 11 }, { type: 'TOOL_CALL_START', toolCallId: 'keep', parentMessageId: 'random' }];

  const actual = normalizeEvents(input);

  assert.deepEqual(actual, [{ type: 'TEXT_MESSAGE_START', messageId: 'message-1', timestamp: '<generated>' }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'message-1', delta: 'random', timestamp: '<generated>' }, { type: 'TOOL_CALL_START', toolCallId: 'keep', parentMessageId: 'message-1' }]);
  assert.equal(input[0].messageId, 'random');
});

test('retained wire and callback results match fresh actual producer execution', async () => {
  const host = await startPydanticHost();
  try {
    for (const scenario of ['streaming', 'server-tool', 'failure', 'cancel-default', 'cancel-v1', 'server-same-name', 'disconnect']) {
      const retained = await readFile(new URL(`./evidence/${scenario}.sse`, import.meta.url));
      const parsed = JSON.parse(await readFile(new URL(`./evidence/${scenario}.events.json`, import.meta.url), 'utf8'));
      const execution = JSON.parse(await readFile(new URL(`./evidence/${scenario}.execution.json`, import.meta.url), 'utf8'));
      const request = JSON.parse(await readFile(new URL(`./evidence/${scenario}.request.json`, import.meta.url), 'utf8'));
      const fresh = await captureScenario(host, scenario);

      if (scenario === 'streaming' || scenario === 'server-tool') {
        const live = JSON.parse(await readFile(new URL(`./evidence/${scenario}.live.json`, import.meta.url), 'utf8'));
        assert.deepEqual(fresh.liveObservations, live);
      }
      assert.deepEqual(parseEvents(retained), parsed);
      if (scenario === 'disconnect') assert.ok(!parseEvents(fresh.bytes).some((event) => event.type === 'RUN_FINISHED' || event.type === 'RUN_ERROR'));
      assert.deepEqual(fresh.body, request);
      assert.deepEqual(normalizeExecution(fresh.observations), normalizeExecution(execution), scenario);
      assert.deepEqual(normalizeEvents(parseEvents(fresh.bytes)), normalizeEvents(parsed), scenario);
      assert.equal(fresh.observations.completed, scenario === 'server-tool' ? 1 : 0);
      assert.equal(fresh.observations.failed, scenario === 'failure' ? 1 : 0);
      assert.equal(fresh.observations.cancelled, scenario.startsWith('cancel') || scenario === 'disconnect' ? 1 : 0);
    }
  } finally { await host.stop(); }
});


test('native normalization preserves tool payload timestamps and generated identity relationships', () => {
  const messages = [{ kind: 'request', run_id: 'native-generated', timestamp: 'native-time', parts: [{ part_kind: 'tool-return', timestamp: 'return-time', tool_call_id: 'application-id', content: { timestamp: 'payload-time', run_id: 'payload-run' } }] }];
  const input = { history: messages, modelRequests: [messages], requests: [{ timestamp: 'request-payload' }] };

  const normalized = normalizeExecution(input);

  assert.equal(normalized.history[0].run_id, normalized.modelRequests[0][0].run_id);
  assert.deepEqual(normalized.history[0].parts[0].content, { timestamp: 'payload-time', run_id: 'payload-run' });
  assert.equal(normalized.history[0].parts[0].tool_call_id, 'application-id');
  assert.deepEqual(normalized.requests, input.requests);
  assert.equal(input.history[0].timestamp, 'native-time');
});

test('retained client HTTP round trip preserves the native continuation request and history', async () => {
  const host = await startPydanticHost();
  try {
    const fresh = await captureClientRoundTrip(host);

    for (const [scenario, capture] of Object.entries(fresh)) {
      const retained = await readFile(new URL(`./evidence/${scenario}.sse`, import.meta.url));
      const execution = JSON.parse(await readFile(new URL(`./evidence/${scenario}.execution.json`, import.meta.url), 'utf8'));
      const request = JSON.parse(await readFile(new URL(`./evidence/${scenario}.request.json`, import.meta.url), 'utf8'));

      assert.deepEqual(normalizeEvents(parseEvents(capture.bytes)), normalizeEvents(parseEvents(retained)));
      assert.deepEqual(capture.body, request);
      assert.deepEqual(normalizeExecution(capture.observations), normalizeExecution(execution));
    }
    assert.ok(JSON.stringify(fresh['client-continuation'].observations.modelRequests).includes('controlled-client-result:London'));
  } finally { await host.stop(); }
});

test('live capture retains delivered tool start and text before the execution gate is released', async () => {
  const host = await startPydanticHost();
  try {
    const tool = await captureScenario(host, 'server-tool');
    const streaming = await captureScenario(host, 'streaming');

    assert.deepEqual(tool.liveObservations, { toolStartSeen: true, completedBeforeRelease: 0 });
    assert.deepEqual(streaming.liveObservations, { textSeen: true, settledBeforeRelease: false });
  } finally { await host.stop(); }
});
