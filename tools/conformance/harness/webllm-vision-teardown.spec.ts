import { captureWebLlmVisionTeardown } from './webllm-vision-teardown';

for (const [failure, responseText] of [
  ['wrong color', '{"answer":"green","count":2}'],
  ['wrong count', '{"answer":"red","count":7}'],
  ['malformed response', '{"answer":'],
  ['generation timeout', '{"answer":"red"'],
]) {
  test(`preserves final schema and raw response after draining ${failure}`, async () => {
    const order: string[] = [];
    const attached: unknown[] = [];
    const schema = '{"type":"object"}';
    const evidence: { schema: string; responseText: string }[] = [];
    let report:
      Awaited<ReturnType<typeof captureWebLlmVisionTeardown>> | undefined;
    const assertion = new Error(failure);

    const run = async () => {
      try {
        throw assertion;
      } finally {
        report = await captureWebLlmVisionTeardown({
          dispose: async () => {
            order.push('drain');
            await Promise.resolve();
            evidence.push({ schema, responseText });
            order.push('unload');
          },
          read: async () => {
            order.push('read');
            return {
              metrics: { activeRequests: 0 },
              evidence: [...evidence],
              media: { released: 1 },
            };
          },
          attach: async (result) => {
            order.push('attach');
            attached.push(result);
          },
        });
      }
    };

    await expect(run()).rejects.toBe(assertion);
    expect(order).toEqual(['drain', 'unload', 'read', 'attach']);
    expect(attached).toEqual([report]);
    expect(report).toEqual({
      snapshot: {
        metrics: { activeRequests: 0 },
        evidence: [{ schema, responseText }],
        media: { released: 1 },
      },
    });
  });
}

test('still captures raw evidence when application cleanup fails', async () => {
  const snapshot = {
    metrics: { unloaded: false },
    evidence: [{ schema: 'schema', responseText: 'malformed output' }],
  };

  const result = await captureWebLlmVisionTeardown({
    dispose: async () => {
      throw new Error('unload failed');
    },
    read: async () => snapshot,
    attach: async () => undefined,
  });

  expect(result).toEqual({ cleanupError: 'unload failed', snapshot });
});

test('records unavailable evidence explicitly when the browser page has gone away', async () => {
  const result = await captureWebLlmVisionTeardown({
    dispose: async () => undefined,
    read: async () => {
      throw new Error('page closed');
    },
    attach: async () => undefined,
  });

  expect(result).toEqual({ evidenceError: 'page closed' });
});
