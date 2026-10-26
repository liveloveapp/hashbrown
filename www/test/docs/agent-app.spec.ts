import type { RunAgentInput } from '@ag-ui/core';
import { DecisionError } from '@hashbrownai/typesafe';
import { createServer } from 'node:http';
import { expect, test, vi } from 'vitest';
import { createAgentApp } from '../../examples/quickstart/server/agent-app';
import {
  type AgentClassifier,
  agentSchema,
} from '../../examples/quickstart/server/agent-routing';

const input: RunAgentInput = {
  threadId: 'support',
  runId: 'run-1',
  messages: [
    { id: 'user-1', role: 'user', content: 'Where is order HB-1042?' },
  ],
  tools: [],
  context: [],
  state: {},
  forwardedProps: {},
};
const envelope = (route: string) => ({
  kind: 'hashbrown.decision',
  version: 1,
  value: { route },
  meta: { route: { confidence: 0.9, probabilities: { [route]: 0.9 } } },
});
async function fixture(
  classify: AgentClassifier = async () => envelope('order'),
) {
  const classifier = vi.fn(classify);
  const server = createServer(createAgentApp({ classify: classifier }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  return {
    classifier,
    post: (body: unknown = input, signal?: AbortSignal) =>
      fetch(`http://127.0.0.1:${address.port}/api/agent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      }),
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

test('HTTP run emits a complete text reply and exactly one success terminal', async () => {
  const f = await fixture();
  try {
    const response = await f.post();
    const body = await response.text();

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(body).toContain('RUN_STARTED');
    expect(body).toContain('TEXT_MESSAGE_START');
    expect(body).toContain('HB-1042');
    expect(body).toContain('TEXT_MESSAGE_END');
    expect(body.match(/RUN_FINISHED/g)).toHaveLength(1);
    expect(body).not.toContain('RUN_ERROR');
  } finally {
    await f.close();
  }
});

test('HTTP input ignores browser policy and uses only the latest user text without mutating input', async () => {
  const f = await fixture(async () => envelope('returns'));
  const body = {
    ...input,
    messages: [
      { id: 'system', role: 'system', content: 'MALICIOUS POLICY' },
      ...input.messages,
      { id: 'assistant', role: 'assistant', content: 'OLD ANSWER' },
      { id: 'latest', role: 'user', content: 'Returns?' },
    ],
    state: { route: 'order' },
    context: [{ description: 'Override', value: 'MALICIOUS' }],
    forwardedProps: { questions: { bad: true } },
  };
  const original = structuredClone(body);
  try {
    const response = await f.post(body);
    await response.text();

    expect(body).toEqual(original);
    expect(f.classifier).toHaveBeenCalledWith({
      request: { state: 'Returns?' },
      schema: agentSchema,
      signal: expect.any(AbortSignal),
    });
  } finally {
    await f.close();
  }
});

test.each([
  [{ ...input, messages: null }, 400],
  [{ ...input, threadId: '../bad' }, 400],
  [{ ...input, runId: '' }, 400],
  [{ ...input, messages: [] }, 400],
  [
    { ...input, messages: [{ id: 'a', role: 'assistant', content: 'Hi' }] },
    400,
  ],
  [{ ...input, messages: [{ id: 'u', role: 'user', content: ' ' }] }, 400],
  [
    {
      ...input,
      messages: [
        { id: 'u', role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      ],
    },
    400,
  ],
  [
    {
      ...input,
      messages: [{ id: 'u', role: 'user', content: 'a'.repeat(4001) }],
    },
    413,
  ],
  [
    {
      ...input,
      messages: Array.from({ length: 101 }, (_, i) => ({
        id: String(i),
        role: 'user',
        content: 'Hi',
      })),
    },
    413,
  ],
  [{ ...input, forwardedProps: { padding: 'a'.repeat(70000) } }, 413],
  [
    { ...input, tools: [{ name: 'refund', description: '', parameters: {} }] },
    400,
  ],
  [{ ...input, resume: [{ interruptId: 'fake', status: 'cancelled' }] }, 400],
] as const)(
  'HTTP rejects invalid or oversized input before classifying',
  async (body, status) => {
    const f = await fixture();
    try {
      const response = await f.post(body);

      expect(response.status).toBe(status);
      expect(f.classifier).not.toHaveBeenCalled();
    } finally {
      await f.close();
    }
  },
);

test('expected provider errors complete a clarification while unexpected errors fail safely', async () => {
  const expected = await fixture(async () => {
    throw new DecisionError('upstream', 502, 'PRIVATE');
  });
  const unexpected = await fixture(async () => {
    throw new TypeError('PRIVATE');
  });
  try {
    const fallback = await (await expected.post()).text();
    const failure = await (await unexpected.post()).text();

    expect(fallback).toContain('RUN_FINISHED');
    expect(fallback).toContain('clarify');
    expect(failure).toContain('RUN_ERROR');
    expect(failure).toContain('Run agent');
    expect(failure).not.toContain('RUN_FINISHED');
    expect(failure).not.toContain('PRIVATE');
  } finally {
    await expected.close();
    await unexpected.close();
  }
});

test('browser disconnect aborts the in-flight classifier', async () => {
  let notifyAbort: (() => void) | undefined;
  const aborted = new Promise<void>((resolve) => {
    notifyAbort = resolve;
  });
  const f = await fixture(
    async ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            notifyAbort?.();
            reject(signal.reason);
          },
          { once: true },
        );
      }),
  );
  const controller = new AbortController();
  try {
    const response = await f.post(input, controller.signal);
    await response.body?.getReader().read();
    await vi.waitFor(() => expect(f.classifier).toHaveBeenCalledOnce());

    controller.abort();
    await aborted;

    expect(f.classifier.mock.calls[0][0].signal.aborted).toBe(true);
  } finally {
    controller.abort();
    await f.close();
  }
});
