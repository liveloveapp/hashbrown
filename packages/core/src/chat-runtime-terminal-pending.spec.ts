import { type AGUIEvent, EventType } from '@ag-ui/core';
import { createChatRuntime } from './chat-runtime';
import { s } from './schema';
import type { TransportRequest } from './transport';

async function idle(runtime: { isLoading: () => boolean }) {
  for (let attempt = 0; attempt < 100; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (!runtime.isLoading()) return;
  }
  throw new Error('Runtime did not settle');
}

test('keeps terminal browser observations open through the real transport and interrupt checkpoint', async () => {
  const requests: TransportRequest[] = [];
  const handler = jest.fn(
    async () => 'original browser handler must stay paused',
  );
  const runtime = createChatRuntime({
    system: 'test',
    debounce: 0,
    messages: [{ role: 'user', content: 'go' }],
    tools: [
      {
        name: 'frontend',
        description: 'browser tool',
        schema: s.object('arguments', {}),
        handler,
      },
    ],
    transport: {
      name: 'terminal-pending-fixture',
      send: async (request) => {
        requests.push(request);
        const first = requests.length === 1;
        return {
          events: (async function* (): AsyncIterable<AGUIEvent> {
            const identity = {
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
            yield { type: EventType.RUN_STARTED, ...identity };
            if (first) {
              for (const [toolCallId, toolCallName] of [
                ['browser', 'frontend'],
                ['protected', 'backend'],
              ]) {
                yield {
                  type: EventType.TOOL_CALL_START,
                  toolCallId,
                  toolCallName,
                  parentMessageId: 'current-parent',
                };
                yield {
                  type: EventType.TOOL_CALL_ARGS,
                  toolCallId,
                  delta: '{}',
                };
                yield { type: EventType.TOOL_CALL_END, toolCallId };
              }
              yield {
                type: EventType.RUN_FINISHED,
                ...identity,
                outcome: {
                  type: 'interrupt',
                  interrupts: [
                    {
                      id: 'approval',
                      reason: 'tool_call',
                      toolCallId: 'protected',
                    },
                  ],
                  pendingToolCallIds: ['browser'],
                },
              } as AGUIEvent;
            } else {
              yield { type: EventType.RUN_FINISHED, ...identity };
            }
          })(),
        };
      },
    },
  });
  const cleanup = runtime.start();

  try {
    await idle(runtime);
    const batch = runtime.pendingInterrupts();
    expect(batch?.interrupts).toEqual([
      { id: 'approval', reason: 'tool_call', toolCallId: 'protected' },
    ]);
    expect(runtime.error()).toBeUndefined();
    expect(requests).toHaveLength(1);
    expect(handler).not.toHaveBeenCalled();
    if (!batch) throw new Error('Expected the genuine protected interrupt');

    runtime.resume({
      batchId: batch.id,
      entries: [
        {
          interruptId: 'approval',
          status: 'resolved',
          payload: { approved: false },
        },
      ],
    });
    await idle(runtime);

    expect(requests).toHaveLength(2);
    const history = requests[1].input.messages;
    const announcement = history.find(
      (message) => message.id === 'current-parent',
    );
    expect(announcement).toMatchObject({
      role: 'assistant',
      toolCalls: [
        {
          id: 'browser',
          type: 'function',
          function: { name: 'frontend', arguments: '{}' },
        },
        {
          id: 'protected',
          type: 'function',
          function: { name: 'backend', arguments: '{}' },
        },
      ],
    });
    const browser = history
      .flatMap((message) =>
        message.role === 'assistant' ? (message.toolCalls ?? []) : [],
      )
      .find((call) => call.id === 'browser');
    expect(browser?.metadata?.['b4.step']).toBeUndefined();
    expect(
      history.some(
        (message) =>
          message.role === 'tool' && message.toolCallId === 'browser',
      ),
    ).toBe(false);
    expect(requests[1].input.resume).toEqual([
      {
        interruptId: 'approval',
        status: 'resolved',
        payload: { approved: false },
      },
    ]);
    expect(handler).not.toHaveBeenCalled();
    expect(runtime.error()).toBeUndefined();
  } finally {
    cleanup();
  }
});
