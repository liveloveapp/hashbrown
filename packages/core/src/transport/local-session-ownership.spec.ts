import { ExperimentalChromeLocalTransport } from './experimental-chrome-local-transport';
import { ExperimentalEdgeLocalTransport } from './experimental-edge-local-transport';
import type { TransportRequest } from './transport';

function request(system: string): TransportRequest {
  return {
    input: {
      threadId: 'thread',
      runId: system,
      messages: [
        { id: 'system', role: 'system', content: system },
        { id: 'user', role: 'user', content: 'Hello' },
      ],
      tools: [],
      context: [],
      state: {},
    },
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: system,
  };
}

for (const [name, Transport] of [
  ['Chrome', ExperimentalChromeLocalTransport],
  ['Edge', ExperimentalEdgeLocalTransport],
] as const) {
  test(`${name} transport destruction owns all differently initialized live sessions`, async () => {
    const sessions = [0, 1].map(() => ({
      prompt: async () => '',
      promptStreaming: () => new ReadableStream<string>(),
      destroy: jest.fn(),
    }));
    const prepare = jest
      .fn()
      .mockResolvedValueOnce(sessions[0])
      .mockResolvedValueOnce(sessions[1]);
    const previous = Object.getOwnPropertyDescriptor(
      globalThis,
      'LanguageModel',
    );
    Object.defineProperty(globalThis, 'LanguageModel', {
      configurable: true,
      value: { create: prepare },
    });
    try {
      const transport = new Transport({});
      const first = await transport.send(request('First instructions'));
      const second = await transport.send(request('Second instructions'));

      await transport.destroy();

      expect(sessions[0].destroy).toHaveBeenCalledTimes(1);
      expect(sessions[1].destroy).toHaveBeenCalledTimes(1);
      await Promise.all([first.dispose?.(), second.dispose?.()]);
      expect(sessions[0].destroy).toHaveBeenCalledTimes(1);
      expect(sessions[1].destroy).toHaveBeenCalledTimes(1);
    } finally {
      if (previous)
        Object.defineProperty(globalThis, 'LanguageModel', previous);
      else Reflect.deleteProperty(globalThis, 'LanguageModel');
    }
  });
}
