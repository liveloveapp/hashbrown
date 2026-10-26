import { runInput, withDotnetFixture } from '../harness/http-fixture';

for (const [name, outcome, snapshot] of [
  ['unknown outcome', 'Invented', null],
  ['running is nonterminal', 'Running', null],
  ['not started is nonterminal', 'NotStarted', null],
  [
    'failed outcome cannot hold completed snapshot',
    'Failed',
    { threadId: 'fixture-thread', messages: [] },
  ],
  [
    'terminal byte bound',
    'Finished',
    {
      threadId: 'fixture-thread',
      messages: [
        { id: 'large', role: 'assistant', content: 'x'.repeat(1024 * 1024) },
      ],
    },
  ],
  [
    'terminal message bound',
    'Finished',
    {
      threadId: 'fixture-thread',
      messages: Array.from({ length: 2049 }, (_, id) => ({
        id: String(id),
        role: 'user',
        content: 'x',
      })),
    },
  ],
] as const) {
  test(`direct memory capture rejects ${name} before mutating current ownership or outcome`, async () => {
    await withDotnetFixture('openai', async (fixture) => {
      const response = await fetch(
        `${fixture.url}/__test/store-capture-validation`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ original: runInput(), outcome, snapshot }),
        },
      );
      const result = await response.json();

      expect(result.rejected).toBe(true);
      expect(result.after).toEqual(result.before);
      expect(result.after.generationOutcome).toBe('Running');
      expect(fixture.requests).toHaveLength(0);
    });
  });
}

test('direct PostgreSQL capture applies the same terminal admission bounds without changing authority', async () => {
  const { withDurableCluster } = await import('../harness/durable-fixture');
  await withDurableCluster('openai', async (cluster) => {
    const fixture = await cluster.start();
    for (const [outcome, snapshot] of [
      ['Invented', null],
      ['Running', null],
      ['Failed', { threadId: 'wrong', messages: [] }],
      ['Finished', { threadId: 'wrong', messages: [] }],
      [
        'Finished',
        {
          threadId: 'wrong',
          messages: [
            {
              id: 'large',
              role: 'assistant',
              content: 'x'.repeat(1024 * 1024),
            },
          ],
        },
      ],
      [
        'Finished',
        {
          threadId: 'wrong',
          messages: Array.from({ length: 2049 }, (_, id) => ({
            id: String(id),
            role: 'user',
            content: 'x',
          })),
        },
      ],
    ] as const) {
      const original = { ...runInput(), threadId: crypto.randomUUID() };

      const response = await fetch(
        `${fixture.url}/__test/store-capture-validation`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ original, outcome, snapshot }),
        },
      );
      const result = await response.json();

      expect(result.rejected).toBe(true);
      expect(result.after).toEqual(result.before);
      expect(result.after.generationOutcome).toBe('Running');
    }
    expect(fixture.requests).toHaveLength(0);
  });
});
