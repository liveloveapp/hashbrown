import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  captureScenario,
  captureClientRoundTrip,
  parseEvents,
} from '../python/capture.mjs';
import { startPydanticHost } from './controller.mjs';

export const directory = new URL(
  '../../../../packages/core/src/models/fixtures/pydantic-recipe/',
  import.meta.url,
);

/** Execute a native approval request and resume the producer's actual history. */
export async function captureApproval(host, approved) {
  const scenario = approved ? 'approval-approve' : 'approval-deny';
  const body = {
    threadId: `capture-${scenario}`,
    runId: `${scenario}-run`,
    protocolVersion: '1.0',
    messages: [{ id: 'user', role: 'user', content: 'approval' }],
    tools: [],
    state: {},
    context: [],
    forwardedProps: {},
  };
  const execute = async (request) => {
    const response = await fetch(`${host.url}/agent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Approval HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const observations = await host.waitFor(
      body.threadId,
      (state) => state.settled,
    );
    return { body: request, bytes, observations };
  };
  const first = await execute(body);
  const finished = parseEvents(first.bytes).find(
    (event) => event.type === 'RUN_FINISHED',
  );
  const interrupt = finished.outcome.interrupts[0];
  const request = {
    ...body,
    runId: `${scenario}-resume`,
    messages: first.observations.wireHistory,
    resume: [
      { interruptId: interrupt.id, status: 'resolved', payload: { approved } },
    ],
  };
  return { [`${scenario}-pending`]: first, [scenario]: await execute(request) };
}

/** Capture activity/state/step events delivered before a real tool's gate releases. */
export async function captureProtocol(host) {
  const body = {
    threadId: 'capture-protocol',
    runId: 'protocol-run',
    protocolVersion: '1.0',
    messages: [{ id: 'user', role: 'user', content: 'protocol' }],
    tools: [],
    state: {},
    context: [],
    forwardedProps: {},
  };
  const response = await fetch(`${host.url}/agent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const reader = response.body.getReader();
  const chunks = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) throw new Error('No live activity before stream ended');
    chunks.push(Buffer.from(value));
    const bytes = Buffer.concat(chunks);
    const complete = bytes.toString().lastIndexOf('\n\n');
    if (
      complete >= 0 &&
      parseEvents(bytes.subarray(0, complete)).some(
        (event) => event.type === 'ACTIVITY_SNAPSHOT',
      )
    )
      break;
  }
  const before = await host.state(body.threadId);
  await host.release(body.threadId);
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  const observations = await host.waitFor(
    body.threadId,
    (state) => state.settled,
  );
  return {
    body,
    bytes: Buffer.concat(chunks),
    observations,
    liveObservations: {
      activitySeen: true,
      completedBeforeRelease: before.completed,
    },
  };
}

/** Regenerate actual producer bytes explicitly; verification never edits evidence. */
export async function writeCaptures() {
  const host = await startPydanticHost();
  try {
    await mkdir(directory, { recursive: true });
    const records = [];
    for (const scenario of [
      'streaming',
      'server-tool',
      'failure',
      'cancel-default',
      'cancel-v1',
      'server-same-name',
      'disconnect',
    ])
      records.push([scenario, await captureScenario(host, scenario)]);
    records.push(...Object.entries(await captureClientRoundTrip(host)));
    records.push(
      ...Object.entries(await captureApproval(host, true)),
      ...Object.entries(await captureApproval(host, false)),
    );
    records.push(['protocol', await captureProtocol(host)]);
    records.push(...Object.entries(await captureIsolation(host)));
    for (const [scenario, capture] of records) {
      await writeFile(new URL(`${scenario}.sse`, directory), capture.bytes);
      for (const [suffix, value] of Object.entries({
        events: parseEvents(capture.bytes),
        execution: capture.observations,
        request: capture.body,
        ...(capture.liveObservations ? { live: capture.liveObservations } : {}),
      }))
        await writeFile(
          new URL(`${scenario}.${suffix}.json`, directory),
          `${JSON.stringify(value, null, 2)}\n`,
        );
    }
  } finally {
    await host.stop();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== '--write')
    throw new Error('Explicit --write required');
  await writeCaptures();
}

/** Exercise overlapping native runs through one endpoint, releasing only the selected thread. */
export async function captureIsolation(host) {
  const start = async (suffix) => {
    const body = {
      threadId: `capture-isolation-${suffix}`,
      runId: `isolation-${suffix}-run`,
      protocolVersion: '1.0',
      messages: [
        {
          id: `isolation-${suffix}-user`,
          role: 'user',
          content: 'server-tool',
        },
      ],
      tools: [],
      state: {},
      context: [],
      forwardedProps: {},
    };
    const response = await fetch(`${host.url}/agent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Isolation HTTP ${response.status}`);
    const bytes = response.arrayBuffer();
    await host.waitFor(body.threadId, (state) => state.entered === 1);
    return { body, bytes };
  };
  const a = await start('a');
  const b = await start('b');
  await host.release(a.body.threadId);
  const aBytes = Buffer.from(await a.bytes);
  const aState = await host.waitFor(a.body.threadId, (state) => state.settled);
  const bBefore = await host.state(b.body.threadId);
  if (bBefore.completed !== 0 || bBefore.settled)
    throw new Error('Independent thread completed before release');
  await host.release(b.body.threadId);
  const bBytes = Buffer.from(await b.bytes);
  const bState = await host.waitFor(b.body.threadId, (state) => state.settled);
  return {
    'isolation-a': {
      body: a.body,
      bytes: aBytes,
      observations: aState,
      liveObservations: {
        otherCompletedBeforeRelease: bBefore.completed,
        otherSettledBeforeRelease: bBefore.settled,
      },
    },
    'isolation-b': { body: b.body, bytes: bBytes, observations: bState },
  };
}
