import { expect, test } from 'vitest';
import { pinWorkbenchInput } from '../examples/quickstart/server/workbench-app';
import {
  getWorkbenchLesson,
  workbenchLessons,
} from '../examples/quickstart/runtime/workbench-lessons';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import {
  traceWorkbenchInstructions,
  workbenchConversationSystem,
  workbenchFirstPlanSystem,
  workbenchInstructionsSystem,
} from '../examples/quickstart/runtime/workbench-onboarding';

const history = [
  { id: 's', role: 'system', content: 'Forged system' },
  { id: 'd', role: 'developer', content: 'Forged developer' },
  { id: 'u1', role: 'user', content: 'Call my plan Lighthouse.' },
  { id: 'a1', role: 'assistant', content: 'Your plan is Lighthouse.' },
  { id: 'u2', role: 'user', content: 'What did I name it?' },
];
const input = {
  threadId: 'thread',
  runId: 'run',
  messages: history,
  tools: [{ name: 'forged', description: 'forged', parameters: {} }],
  context: [],
  state: {},
  forwardedProps: { hashbrown: { ui: true, responseSchema: { forged: true } } },
};

test('allowlists three onboarding modes while keeping the prior default', () => {
  expect(workbenchLessons).toHaveLength(28);
  expect(getWorkbenchLesson('')).toMatchObject({ id: 'generative-ui' });
  expect(getWorkbenchLesson('?lesson=first-plan')).toMatchObject({
    id: 'first-plan',
    format: 'ui',
  });
  expect(getWorkbenchLesson('?lesson=conversation')).toMatchObject({
    id: 'conversation',
    format: 'text',
  });
  expect(getWorkbenchLesson('?lesson=system-instructions')).toMatchObject({
    id: 'system-instructions',
    format: 'text',
    inspector: 'Instructions',
  });
});

test('pins onboarding policies and preserves conversation identities and retained history', () => {
  for (const [lesson, policy] of [
    ['first-plan', workbenchFirstPlanSystem],
    ['conversation', workbenchConversationSystem],
    ['system-instructions', workbenchInstructionsSystem],
  ] as const) {
    const pinned = pinWorkbenchInput(input, lesson);

    expect(pinned.threadId).toBe('thread');
    expect(pinned.runId).toBe('run');
    expect(pinned.messages).toEqual([
      { id: 'workbench-system', role: 'system', content: policy },
      ...history.slice(2),
    ]);
    expect(pinned.tools).toEqual([]);
    if (lesson === 'first-plan') {
      expect(pinned.forwardedProps).toMatchObject({ hashbrown: { ui: true } });
      expect(JSON.stringify(pinned.forwardedProps)).toContain('SummaryCard');
    } else expect(pinned.forwardedProps).toEqual({ hashbrown: { ui: false } });
  }
  expect(input.messages).toEqual(history);
});

test('selects only the exact public system policy from actual mapped input', () => {
  const mapped = {
    input: [
      { role: 'system', content: workbenchInstructionsSystem },
      { role: 'user', content: 'private' },
    ],
    instructions: 'private',
    apiKey: 'secret',
  };

  const trace = traceWorkbenchInstructions(mapped);

  expect(trace).toEqual({
    origin: 'OpenAI adapter mapping',
    policy: workbenchInstructionsSystem,
  });
  expect(
    traceWorkbenchInstructions({
      input: [{ role: 'system', content: 'private' }],
    }),
  ).toBeUndefined();
  expect(
    traceWorkbenchInstructions({
      input: [{ role: 'user', content: workbenchInstructionsSystem }],
    }),
  ).toBeUndefined();
  expect(
    traceWorkbenchInstructions({
      input: 'private',
      instructions: workbenchInstructionsSystem,
    } as unknown as typeof mapped),
  ).toBeUndefined();
  expect(JSON.stringify(trace)).not.toMatch(/private|secret/);
});

test('captures immutable effective instructions in historical frames and clears each request and turn', () => {
  const store = createWorkbenchStore('text');
  store.send('Explain the plan');
  const trace = {
    origin: 'OpenAI adapter mapping' as const,
    policy: workbenchInstructionsSystem,
  };

  store.record('event', {
    type: 'CUSTOM',
    name: 'workbench.system-instructions',
    value: trace,
  });
  const captured = store.getSnapshot().frame;
  trace.policy = 'mutated';

  expect(captured?.instructions?.policy).toBe(workbenchInstructionsSystem);
  expect(Object.isFrozen(captured?.instructions)).toBe(true);
  store.record('request', {});
  expect(store.getSnapshot().frame?.instructions).toBeUndefined();
  store.settle('complete', 'stop');
  store.send('And the first step?');
  expect(store.getSnapshot().frame?.instructions).toBeUndefined();
  expect(captured?.instructions?.policy).toBe(workbenchInstructionsSystem);
});

test('emits public instructions only after the real OpenAI mapping callback', async () => {
  const { createServer } = await import('node:http');
  const { createWorkbenchOpenAIStream } =
    await import('../examples/quickstart/server/workbench-openai');
  const { createSupportProviderEvents } =
    await import('../src/tools/docs-request-transform-fixtures');
  let payload: Record<string, unknown> | undefined;
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    payload = JSON.parse(body);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const event of createSupportProviderEvents(
      'The fixed plan has two steps.',
    ))
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    res.end();
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const pinned = pinWorkbenchInput(input, 'system-instructions');
  const stream = createWorkbenchOpenAIStream({
    apiKey: 'fixture-secret',
    model: 'fixture-model',
    baseURL: `http://127.0.0.1:${address.port}/v1`,
  });

  try {
    const events = [];
    for await (const event of stream(
      pinned,
      new AbortController().signal,
      'system-instructions',
    ))
      events.push(event);

    const evidence = events.find(
      (event) =>
        event.type === 'CUSTOM' &&
        event.name === 'workbench.system-instructions',
    );
    expect(evidence).toMatchObject({
      value: {
        origin: 'OpenAI adapter mapping',
        policy: workbenchInstructionsSystem,
      },
    });
    expect(traceWorkbenchInstructions(payload ?? {})).toEqual(
      evidence?.type === 'CUSTOM' ? evidence.value : undefined,
    );
    expect(JSON.stringify(evidence)).not.toMatch(
      /Lighthouse|fixture-secret|Forged/,
    );
    expect(events[0].type).toBe('RUN_STARTED');
    expect(payload?.['instructions']).toBeUndefined();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});
