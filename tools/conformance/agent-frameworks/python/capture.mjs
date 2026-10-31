import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startPydanticHost } from './controller.mjs';

/** Parse standard SSE data frames while leaving retained wire bytes untouched. */
export function parseEvents(bytes) {
  return bytes.toString('utf8').split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => JSON.parse(line.slice(5)));
}

/** Capture an actual HTTP scenario including independent callback observations. */
export async function captureScenario(host, scenario) {
  const threadId = `capture-${scenario}`;
  const body = { threadId, runId: `${threadId}-run`, messages: [{ id: `${threadId}-user`, role: 'user', content: scenario.startsWith('cancel') || scenario === 'disconnect' ? 'server-tool' : scenario }], tools: [], context: [], state: {}, forwardedProps: {} };
  if (scenario === 'server-same-name') body.tools = [{ name: 'getWeather', description: 'Browser weather', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } }];
  if (scenario !== 'cancel-default') body.protocolVersion = '1.0';
  const abort = new AbortController();
  const response = await fetch(`${host.url}/agent`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream' }, body: JSON.stringify(body), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]) });
  if (!response.ok) throw new Error(`Capture HTTP ${response.status}`);
  const chunks = [];
  const reader = response.body.getReader();
  let liveObservations;
  if (scenario === 'streaming' || scenario === 'server-tool') {
    const expectedType = scenario === 'streaming' ? 'TEXT_MESSAGE_CONTENT' : 'TOOL_CALL_START';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error(`SSE ended before delivered ${expectedType}`);
      chunks.push(Buffer.from(value));
      const delivered = Buffer.concat(chunks).toString('utf8');
      const completeEnd = delivered.lastIndexOf('\n\n');
      if (completeEnd >= 0 && parseEvents(Buffer.from(delivered.slice(0, completeEnd))).some((event) => event.type === expectedType)) break;
    }
  }
  const consumption = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
      }
    } catch (error) { if (scenario !== 'disconnect' || error.name !== 'AbortError') throw error; }
  })();
  if (scenario === 'streaming') {
    const before = await host.waitFor(threadId, (state) => state.streamEntered);
    liveObservations = { textSeen: true, settledBeforeRelease: before.settled };
    await host.release(threadId);
  } else if (scenario !== 'failure' && scenario !== 'server-same-name') {
    const before = await host.waitFor(threadId, (state) => state.entered === 1);
    if (scenario === 'server-tool') liveObservations = { toolStartSeen: true, completedBeforeRelease: before.completed };
    if (scenario.startsWith('cancel')) await host.cancel(threadId);
    else if (scenario === 'disconnect') abort.abort();
    else await host.release(threadId);
  }
  await consumption;
  const observations = await host.waitFor(threadId, (state) => state.settled && (scenario !== 'disconnect' || state.cancelled === 1));
  return { body, bytes: Buffer.concat(chunks), observations, ...(liveObservations ? { liveObservations } : {}) };
}

/** Capture native frontend tool deferral and a controlled HTTP tool-result continuation. */
export async function captureClientRoundTrip(host) {
  const body = { threadId: 'capture-client-tool', runId: 'capture-client-tool-run', protocolVersion: '1.0', messages: [{ id: 'client-user', role: 'user', content: 'client-tool' }], tools: [{ name: 'getWeather', description: 'Browser weather', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } }], context: [], state: {}, forwardedProps: {} };
  const execute = async (request) => {
    const response = await fetch(`${host.url}/agent`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream' }, body: JSON.stringify(request), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Client capture HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const observations = await host.waitFor(body.threadId, (state) => state.settled);
    return { body: request, bytes, observations };
  };
  const first = await execute(body);
  const parsed = parseEvents(first.bytes);
  const call = parsed.find((event) => event.type === 'TOOL_CALL_START');
  const args = parsed.filter((event) => event.type === 'TOOL_CALL_ARGS').map((event) => event.delta).join('');
  const continuation = { ...body, runId: 'capture-client-continuation-run', messages: [...body.messages, { id: 'client-assistant', role: 'assistant', toolCalls: [{ id: call.toolCallId, type: 'function', function: { name: call.toolCallName, arguments: args } }] }, { id: 'client-result', role: 'tool', toolCallId: call.toolCallId, content: 'controlled-client-result:London' }] };
  return { 'client-tool': first, 'client-continuation': await execute(continuation) };
}

/** Explicit regeneration only; verification never rewrites reviewed evidence. */
export async function writeCaptures(directory = new URL('./evidence/', import.meta.url)) {
  const host = await startPydanticHost();
  try {
    await mkdir(directory, { recursive: true });
    const records = [];
    for (const scenario of ['streaming', 'server-tool', 'failure', 'cancel-default', 'cancel-v1', 'disconnect', 'server-same-name']) {
      const capture = await captureScenario(host, scenario);
      records.push([scenario, capture]);
    }
    records.push(...Object.entries(await captureClientRoundTrip(host)));
    for (const [scenario, capture] of records) {
      if (capture.liveObservations) await writeFile(new URL(`${scenario}.live.json`, directory), `${JSON.stringify(capture.liveObservations, null, 2)}\n`);
      await writeFile(new URL(`${scenario}.sse`, directory), capture.bytes);
      await writeFile(new URL(`${scenario}.events.json`, directory), `${JSON.stringify(parseEvents(capture.bytes), null, 2)}\n`);
      await writeFile(new URL(`${scenario}.execution.json`, directory), `${JSON.stringify(capture.observations, null, 2)}\n`);
      await writeFile(new URL(`${scenario}.request.json`, directory), `${JSON.stringify(capture.body, null, 2)}\n`);
    }
  } finally { await host.stop(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== '--write') throw new Error('Capture regeneration requires explicit --write');
  await writeCaptures();
}
