import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startPydanticHost } from './controller.mjs';

const input = (threadId, scenario, messages = []) => ({ threadId, runId: `${threadId}-run`, messages: [...messages, { id: `${threadId}-user`, role: 'user', content: scenario }], tools: [], context: [], state: {}, forwardedProps: {}, protocolVersion: '1.0' });

async function run(host, body, signal) {
  const response = await fetch(`${host.url}/agent`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream' }, body: JSON.stringify(body), signal: signal ?? AbortSignal.timeout(15000) });
  assert.equal(response.status, 200);
  return response;
}

const events = (raw) => raw.split('\n').filter((line) => line.startsWith('data:')).map((line) => JSON.parse(line.slice(5)));

test('real HTTP emits tool start before actual gated completion and preserves native history', async () => {
  const host = await startPydanticHost();
  try {
    const response = await run(host, input('gate', 'server-tool'));
    const reader = response.body.getReader();
    let raw = '';
    while (!raw.includes('TOOL_CALL_START')) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false, 'SSE ended before TOOL_CALL_START');
      raw += new TextDecoder().decode(chunk.value);
    }
    const entered = await host.waitFor('gate', (state) => state.entered === 1);

    assert.equal(entered.completed, 0);
    await host.release('gate');
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      raw += new TextDecoder().decode(chunk.value);
    }
    const state = await host.waitFor('gate', (value) => value.settled);

    assert.equal(state.completed, 1);
    assert.ok(events(raw).some((event) => event.type === 'TOOL_CALL_START'));
    assert.ok(events(raw).some((event) => event.type === 'RUN_FINISHED'));
    assert.ok(JSON.stringify(state.history).includes('server-result'));
  } finally { await host.stop(); }
});

test('independent frontend tool result reaches the next native request', async () => {
  const host = await startPydanticHost();
  try {
    const request = input('client', 'client-tool');
    request.tools = [{ name: 'getWeather', description: 'Weather', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } }];
    const first = events(await (await run(host, request)).text());
    const call = first.find((event) => event.type === 'TOOL_CALL_START');
    const args = first.filter((event) => event.type === 'TOOL_CALL_ARGS').map((event) => event.delta).join('');
    const continuation = { ...request, runId: 'client-next', messages: [...request.messages, { id: 'assistant-client', role: 'assistant', toolCalls: [{ id: call.toolCallId, type: 'function', function: { name: 'getWeather', arguments: args } }] }, { id: 'weather-result', role: 'tool', toolCallId: call.toolCallId, content: 'sunny-browser-result' }] };

    const final = events(await (await run(host, continuation)).text());
    const state = await host.state('client');

    assert.equal(call.toolCallName, 'getWeather');
    assert.ok(final.some((event) => event.type === 'TEXT_MESSAGE_CONTENT' && event.delta.includes('sunny-browser-result')));
    assert.ok(JSON.stringify(state.modelRequests).includes('sunny-browser-result'));
  } finally { await host.stop(); }
});

test('explicit cancellation cancels real callback without a late completion or cross-thread release', async () => {
  const host = await startPydanticHost();
  try {
    const a = (await run(host, input('cancel-a', 'server-tool'))).text();
    const b = (await run(host, input('cancel-b', 'server-tool'))).text();
    await host.waitFor('cancel-a', (state) => state.entered === 1);
    await host.waitFor('cancel-b', (state) => state.entered === 1);

    await host.cancel('cancel-a');
    const raw = await a;
    await host.release('cancel-a');
    const state = await host.waitFor('cancel-a', (value) => value.cancelled === 1 && value.settled);

    assert.equal(state.completed, 0);
    const otherPending = await host.state('cancel-b');
    assert.equal(otherPending.completed, 0);
    assert.equal(otherPending.cancelled, 0);
    assert.equal(otherPending.settled, false);
    assert.equal(events(raw).find((event) => event.type === 'RUN_FINISHED').outcome.type, 'cancelled');
    await host.release('cancel-b');
    await b;
    assert.equal((await host.state('cancel-b')).completed, 1);
  } finally { await host.stop(); }
});

test('actual callback failure yields producer error and subscriber disconnect is observed separately', async () => {
  const host = await startPydanticHost();
  try {
    const failure = events(await (await run(host, input('failure', 'failure'))).text());
    const abort = new AbortController();
    const disconnected = await run(host, input('disconnect', 'server-tool'), abort.signal);
    const consuming = disconnected.text().catch(() => '');
    await host.waitFor('disconnect', (state) => state.entered === 1);

    abort.abort();
    await consuming;
    const state = await host.waitFor('disconnect', (value) => value.cancelled === 1);

    assert.ok(failure.some((event) => event.type === 'RUN_ERROR'));
    assert.equal((await host.state('failure')).failed, 1);
    assert.equal(state.explicitCancel, false);
    assert.equal(state.completed, 0);
  } finally { await host.stop(); }
});

test('streaming text is observable before release and next turn preserves native history', async () => {
  const host = await startPydanticHost();
  try {
    const first = await run(host, input('stream', 'streaming'));
    const reader = first.body.getReader();
    let raw = '';
    while (!raw.includes('Pydantic streaming ')) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false, 'SSE ended before streaming text');
      raw += new TextDecoder().decode(chunk.value);
    }
    const pending = await host.waitFor('stream', (state) => state.streamEntered);

    assert.equal(pending.settled, false);
    assert.ok(!raw.includes('answer.'));
    await host.release('stream');
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      raw += new TextDecoder().decode(chunk.value);
    }
    const history = [{ id: 'old-user', role: 'user', content: 'earlier user' }, { id: 'old-assistant', role: 'assistant', content: 'earlier answer' }];
    const next = (await run(host, input('stream', 'streaming', history))).text();
    await host.waitFor('stream', (state) => state.modelRequests.length === 2);
    await host.release('stream');
    await next;

    assert.ok(raw.includes('answer.'));
    assert.ok(JSON.stringify((await host.state('stream')).modelRequests[1]).includes('earlier answer'));
  } finally { await host.stop(); }
});

test('same-name native and frontend definitions produce actual upstream collision error', async () => {
  const host = await startPydanticHost();
  try {
    const body = input('same-name', 'server-same-name');
    body.tools = [{ name: 'getWeather', description: 'Browser weather', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } }];

    const observed = events(await (await run(host, body)).text());
    const state = await host.state('same-name');

    assert.equal(state.entered, 0);
    assert.equal(state.completed, 0);
    assert.equal(state.modelRequests.length, 0);
    assert.ok(observed.some((event) => event.type === 'RUN_ERROR' && event.message.includes('conflicts with existing tool')));
  } finally { await host.stop(); }
});

test('startup reports a missing executable cleanly and stopped hosts close their endpoint', async () => {
  await assert.rejects(startPydanticHost({ python: '/private/tmp/hashbrown-python-does-not-exist' }), /Python host did not start.*ENOENT/s);
  const host = await startPydanticHost();
  const url = host.url;

  await host.stop();

  await assert.rejects(fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) }));
});

test('waitFor tolerates only an unknown thread until the actual request arrives', async () => {
  const host = await startPydanticHost();
  try {
    const observed = host.waitFor('late-request', (state) => state.streamEntered);
    const response = await run(host, input('late-request', 'streaming'));
    const finished = response.text();

    assert.equal((await observed).streamEntered, true);
    await host.release('late-request');
    await finished;
  } finally { await host.stop(); }
});

test('an active thread rejects overlapping requests until the original stream settles', async () => {
  const host = await startPydanticHost();
  try {
    const body = input('overlap', 'server-tool');
    const first = (await run(host, body)).text();
    await host.waitFor('overlap', (state) => state.entered === 1);

    const overlap = await fetch(`${host.url}/agent`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });

    assert.equal(overlap.status, 409);
    assert.equal((await host.state('overlap')).requests.length, 1);
    await host.release('overlap');
    await first;
    assert.equal((await host.state('overlap')).settled, true);
  } finally { await host.stop(); }
});
