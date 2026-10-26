import { postRun, runInput, withDotnetFixture } from '../harness/http-fixture';
import { durableEffects, withDurableCluster } from '../harness/durable-fixture';

const base = {
  ModelApi: 'chat-completions',
  Provider: 'openai',
  ModelEndpoint: 'https://models.example/v1/',
  Model: 'model-one',
};

for (const durable of [false, true]) {
  for (const [name, changed] of Object.entries({
    api: { ModelApi: 'responses' },
    provider: { Provider: 'azure' },
    endpoint: { ModelEndpoint: 'https://other.example/v1/' },
    model: { Model: 'model-two' },
    legacy: null,
  })) {
    test(`${durable ? 'PostgreSQL' : 'memory'} rejects ${name} compatibility changes for recovery and direct resume with unchanged input`, async () => {
      const check = async (fixture: {
        url: string;
        requests: readonly unknown[];
      }) => {
        const response = await fetch(`${fixture.url}/__test/server-identity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            original: runInput(),
            source: base,
            target: changed === null ? null : { ...base, ...changed },
          }),
        });
        const result = await response.json();

        expect(result.recovery).toBe(409);
        expect(result.resume).toBe(409);
        expect(result.reverseRecovery).toBe(409);
        expect(result.reverseResume).toBe(409);
        expect(result.fingerprintBound).toBe(true);
        expect(result.schemaVersion).toBe(durable ? 3 : null);
        expect(result.sameRecovery).toBe(200);
        expect(result.sameResume).toBe(200);
        expect(fixture.requests).toHaveLength(0);
      };

      if (durable)
        await withDurableCluster('openai', async (cluster) =>
          check(await cluster.start()),
        );
      else await withDotnetFixture('openai', check);
    });
  }
}

test('identity canonicalizes trusted effective endpoint and excludes credentials', async () => {
  await withDotnetFixture('openai', async (fixture) => {
    const response = await fetch(`${fixture.url}/__test/server-identity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        original: runInput(),
        source: {
          ...base,
          Provider: 'azure',
          ModelApi: 'responses',
          ModelEndpoint: 'https://MODELS.example:443/',
          ApiKey: 'secret-one',
        },
        target: {
          ...base,
          Provider: 'azure',
          ModelApi: 'responses',
          ModelEndpoint: 'https://models.example/openai/v1/',
          ApiKey: 'secret-two',
        },
      }),
    });
    const result = await response.json();

    expect(result.sourceIdentity).toMatch(/^[A-F0-9]{64}$/);
    expect(result.sourceIdentity).toBe(result.targetIdentity);
    expect(result.recovery).toBe(200);
    expect(result.resume).toBe(200);
    expect(fixture.requests).toHaveLength(0);
  });
});

for (const durable of [false, true]) {
  test(`${durable ? 'PostgreSQL' : 'memory'} retains explicit legacy compatibility when identity is omitted`, async () => {
    const check = async (fixture: {
      url: string;
      requests: readonly unknown[];
    }) => {
      const response = await fetch(`${fixture.url}/__test/server-identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original: runInput(),
          source: null,
          target: null,
        }),
      });
      const result = await response.json();

      expect(result.sourceIdentity).toBeNull();
      expect(result.recovery).toBe(200);
      expect(result.resume).toBe(200);
      expect(fixture.requests).toHaveLength(0);
    };

    if (durable)
      await withDurableCluster('openai', async (cluster) =>
        check(await cluster.start()),
      );
    else await withDotnetFixture('openai', check);
  });

  test(`${durable ? 'PostgreSQL' : 'memory'} rejects identity mismatch after original history becomes unavailable`, async () => {
    const check = async (fixture: {
      url: string;
      requests: readonly unknown[];
    }) => {
      const response = await fetch(`${fixture.url}/__test/server-identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original: runInput(),
          unavailable: true,
          source: base,
          target: { ...base, ModelApi: 'responses' },
        }),
      });
      const result = await response.json();

      expect(result.recovery).toBe(409);
      expect(result.resume).toBe(409);
      expect(result.reverseRecovery).toBe(409);
      expect(result.reverseResume).toBe(409);
      expect(fixture.requests).toHaveLength(0);
    };

    if (durable)
      await withDurableCluster('openai', async (cluster) =>
        check(await cluster.start()),
      );
    else await withDotnetFixture('openai', check);
  });
}

for (const originalApi of ['responses', 'chat-completions']) {
  test(`process restart rejects a ${originalApi} checkpoint under the other API before model or effect work`, async () => {
    await withDurableCluster('openai', async (cluster) => {
      const original = await cluster.start({ ModelApi: originalApi });
      const input = runInput();
      const interrupted = await postRun(original, input, {
        'X-Fixture-Principal': 'alice',
      });
      const interrupts = (
        interrupted.events.at(-1)?.outcome as {
          interrupts: Array<{ id: string }>;
        }
      ).interrupts;
      await original.stop();
      const replacement = await cluster.start({
        ModelApi:
          originalApi === 'responses' ? 'chat-completions' : 'responses',
      });

      const recovered = await fetch(
        `${replacement.url}/threads/${input.threadId}/recovery`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Fixture-Principal': 'alice',
          },
          body: JSON.stringify({
            tools: input.tools,
            forwardedProps: input.forwardedProps,
          }),
        },
      );
      const resumed = await postRun(
        replacement,
        {
          ...input,
          runId: crypto.randomUUID(),
          resume: interrupts.map(({ id }) => ({
            interruptId: id,
            status: 'resolved',
            payload: { approved: true },
          })),
        },
        { 'X-Fixture-Principal': 'alice' },
      );

      expect(recovered.status).toBe(409);
      expect(resumed.response.status).toBe(409);
      expect(replacement.requests).toHaveLength(0);
      expect(await durableEffects(replacement)).toBe(0);
    });
  });
}

test('genuine v2 migration preserves legacy authority and rejects bound-server recovery without backfilling identity', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const fixture = await cluster.start();

    const response = await fetch(
      `${fixture.url}/__test/server-identity-migration`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(runInput()),
      },
    );

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.beforeVersion).toBe(2);
    expect(result.afterVersion).toBe(3);
    expect(result.identity).toBeNull();
    expect(result.before).toEqual(result.after);
    expect(result.boundRecovery).toBe(409);
    expect(result.boundResume).toBe(409);
    expect(result.legacyRecovery).toBe(200);
    expect(result.legacyResume).toBe(200);
    expect(result.v2NewRowResume).toBe(400);
    expect(fixture.requests).toHaveLength(0);
    expect(await durableEffects(fixture)).toBe(0);
  });
});

test('identity retains distinct multiple trailing path separators', async () => {
  await withDotnetFixture('openai', async (fixture) => {
    const response = await fetch(`${fixture.url}/__test/server-identity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        original: runInput(),
        source: base,
        target: { ...base, ModelEndpoint: 'https://models.example/v1//' },
      }),
    });
    const result = await response.json();

    expect(result.sourceIdentity).not.toBe(result.targetIdentity);
    expect(result.recovery).toBe(409);
    expect(result.resume).toBe(409);
    expect(fixture.requests).toHaveLength(0);
  });
});

for (const mode of ['api-key', 'azure-cli', 'managed-identity']) {
  test(`identity excludes ${mode} authentication and managed identity selectors`, async () => {
    await withDotnetFixture('openai', async (fixture) => {
      const source = {
        ...base,
        Provider: 'azure',
        AzureAuthentication: 'api-key',
        ApiKey: 'rotating-key-one',
      };
      const target = {
        ...source,
        AzureAuthentication: mode,
        ApiKey: 'rotating-key-two',
        ManagedIdentityClientId: 'trusted-user-client',
      };

      const response = await fetch(`${fixture.url}/__test/server-identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original: runInput(), source, target }),
      });
      const result = await response.json();

      expect(result.sourceIdentity).toBe(result.targetIdentity);
      expect(result.recovery).toBe(200);
      expect(result.resume).toBe(200);
      expect(fixture.requests).toHaveLength(0);
    });
  });
}
