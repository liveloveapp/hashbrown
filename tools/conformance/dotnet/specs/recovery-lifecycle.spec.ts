import { expect, type Page, test } from '@playwright/test';
import { createAppDriver } from '../../harness/app-driver';
import { withRoutedEndpoint } from '../harness/routed-endpoint';
import {
  control,
  durableEffects,
  waitForStage,
  withDurableCluster,
} from '../harness/durable-fixture';

async function open(page: Page, runUrl: string, scenario = 'plain') {
  await page.goto(
    `/?${new URLSearchParams({ scenario, runUrl, recoveryUrl: new URL(runUrl).origin, fixturePrincipal: 'alice', retries: '0' })}`,
  );
}

async function pending(page: Page, runUrl: string) {
  await open(page, runUrl);
  await createAppDriver(page).send('Hello fixture');
  await expect(page.getByTestId('interrupt-count')).toHaveText('2');
}

async function refresh(page: Page, disposition: string) {
  await page.getByTestId('refresh-recovery').click();
  await expect(page.getByTestId('recovery-status')).toHaveText(disposition);
  await expect(page.getByTestId('recovery-fetching')).toHaveText('false');
}

test('reload after worker death recovers on another instance without model or effect work', async ({
  page,
}, info) => {
  await withDurableCluster(
    info.project.metadata['provider'] as 'openai' | 'azure',
    async (cluster) => {
      const first = await cluster.start();
      await withRoutedEndpoint(`${first.url}/run`, async (endpoint) => {
        await pending(page, endpoint.url);
        const original = JSON.parse(endpoint.requests[0]);
        await first.stop();
        const second = await cluster.start({ CheckpointCode: 'BAD' });
        endpoint.routeTo(`${second.url}/run`);

        await page.reload();
        await refresh(page, 'Pending');

        expect(second.requests).toHaveLength(0);
        expect(await durableEffects(second)).toBe(0);
        await page.getByTestId('resume').click();
        await expect(createAppDriver(page).assistant()).toHaveText(
          'Hello from .NET',
        );
        expect(JSON.parse(endpoint.requests[1]).messages).toEqual(
          original.messages,
        );
        expect(second.requests).toHaveLength(1);
        expect(await durableEffects(second)).toBe(1);
      });
    },
  );
});

test('acknowledged application-progress stream failure recovers pre-effect work only after explicit lease refresh', async ({
  page,
}, info) => {
  await withDurableCluster(
    info.project.metadata['provider'] as 'openai' | 'azure',
    async (cluster) => {
      const first = await cluster.start({
        Workflow: 'confirm-before',
        FixtureProgressPrelude: 'true',
        FixtureAcknowledgement: 'observe',
      });
      const second = await cluster.start();
      await withRoutedEndpoint(`${first.url}/run`, async (endpoint) => {
        await pending(page, endpoint.url);
        await expect(createAppDriver(page).assistant()).toBeEmpty();
        await page.getByTestId('resume').click();
        await waitForStage(first, 'before');
        await expect(createAppDriver(page).assistant()).toHaveText(
          'Preparing server action.',
        );
        const acknowledgement = await (
          await fetch(`${first.url}/__test/acknowledgement`)
        ).json();
        expect(acknowledgement, JSON.stringify(acknowledgement)).toMatchObject({
          started: 1,
        });
        await expect(page.getByTestId('interrupt-count')).toHaveText('0');
        await expect(page.getByTestId('is-resuming')).toHaveText('true');
        expect(first.requests).toHaveLength(0);
        expect(await durableEffects(second)).toBe(0);
        await first.stop();
        endpoint.routeTo(`${second.url}/run`);
        await expect(page.getByTestId('recovery-required')).toHaveText('true');

        await refresh(page, 'Busy');

        await expect(createAppDriver(page).assistant()).toBeEmpty();
        await expect(page.getByTestId('send')).toBeDisabled();
        await expect(page.getByTestId('resume')).toBeDisabled();
        await expect(page.getByTestId('decline')).toBeDisabled();
        await expect(page.getByTestId('cancel')).toBeDisabled();
        expect(await durableEffects(second)).toBe(0);
        expect(second.requests).toHaveLength(0);
        await control(second, 'expire-lease');
        await refresh(page, 'Pending');
        await expect(page.getByTestId('interrupt-count')).toHaveText('2');
        expect(second.requests).toHaveLength(0);
        await page.getByTestId('resume').click();
        await expect(createAppDriver(page).assistant()).toHaveText(
          'Hello from .NET',
        );
        expect(await durableEffects(second)).toBe(1);
        expect(second.requests).toHaveLength(1);
      });
    },
  );
});

test('two reloaded tabs compete for one effect and the conflict loser refreshes explicitly', async ({
  page,
  context,
}, info) => {
  await withDurableCluster(
    info.project.metadata['provider'] as 'openai' | 'azure',
    async (cluster) => {
      const fixture = await cluster.start({ Workflow: 'confirm-before' });
      await withRoutedEndpoint(`${fixture.url}/run`, async (endpoint) => {
        await pending(page, endpoint.url);
        const second = await context.newPage();
        try {
          await second.goto(page.url());
          await page.reload();
          await refresh(page, 'Pending');
          await refresh(second, 'Pending');
          const firstBatch = await page
            .getByTestId('interrupt-batch-id')
            .textContent();
          await expect(second.getByTestId('interrupt-batch-id')).not.toHaveText(
            firstBatch ?? '',
          );

          await page.getByTestId('resume').click();
          await waitForStage(fixture, 'before');
          const conflict = second.waitForResponse(
            (response) =>
              response.url() === endpoint.url && response.status() === 409,
          );
          await second.getByTestId('resume').click();
          await conflict;

          expect(await durableEffects(fixture)).toBe(0);
          expect(fixture.requests).toHaveLength(0);
          await refresh(second, 'Busy');
          await expect(second.getByTestId('resume')).toBeDisabled();
          await control(fixture, 'release-checkpoint');
          await expect(createAppDriver(page).assistant()).toHaveText(
            'Hello from .NET',
          );
          await refresh(second, 'Completed');
          await expect(createAppDriver(second).assistant()).toHaveText(
            'Hello from .NET',
          );
          expect(fixture.requests).toHaveLength(1);
          expect(await durableEffects(fixture)).toBe(1);
        } finally {
          await control(fixture, 'release-checkpoint');
          await second.close();
        }
      });
    },
  );
});

test('another authenticated principal receives nondisclosing 404 and no restored history', async ({
  page,
}, info) => {
  await withDurableCluster(
    info.project.metadata['provider'] as 'openai' | 'azure',
    async (cluster) => {
      const fixture = await cluster.start();
      await withRoutedEndpoint(`${fixture.url}/run`, async (endpoint) => {
        await pending(page, endpoint.url);
        const url = new URL(page.url());
        url.searchParams.set('fixturePrincipal', 'bob');

        await page.goto(url.href);
        await refresh(page, 'Recovery HTTP 404');

        await expect(page.getByTestId('interrupt-count')).toHaveText('0');
        await expect(createAppDriver(page).assistant()).toBeEmpty();
        await expect(page.getByTestId('send')).toBeDisabled();
        expect(fixture.requests).toHaveLength(0);
        expect(await durableEffects(fixture)).toBe(0);
      });
    },
  );
});

test('a delayed real recovery lookup cannot replace a newer thread or its status', async ({
  page,
}, info) => {
  await withDurableCluster(
    info.project.metadata['provider'] as 'openai' | 'azure',
    async (cluster) => {
      const fixture = await cluster.start();
      await withRoutedEndpoint(`${fixture.url}/run`, async (endpoint) => {
        await pending(page, endpoint.url);
        await page.reload();
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        let arrived!: () => void;
        const lookup = new Promise<void>((resolve) => {
          arrived = resolve;
        });
        let settled!: () => void;
        const settlement = new Promise<void>((resolve) => {
          settled = resolve;
        });
        await page.route('**/threads/*/recovery', async (route) => {
          const response = await route.fetch();
          arrived();
          await gate;
          await route.fulfill({ response });
          settled();
        });
        try {
          await page.getByTestId('refresh-recovery').click();
          await lookup;
          await expect(page.getByTestId('send')).toBeDisabled();
          const oldThread = await page
            .getByTestId('recovery-thread')
            .textContent();

          await page.getByTestId('new-thread').click();
          release();
          await settlement;
          await page.evaluate(
            () =>
              new Promise<void>((resolve) =>
                requestAnimationFrame(() => resolve()),
              ),
          );

          await expect(page.getByTestId('recovery-thread')).not.toHaveText(
            oldThread ?? '',
          );
          await expect(page.getByTestId('recovery-status')).toBeEmpty();
          await expect(page.getByTestId('recovery-fetching')).toHaveText(
            'false',
          );
          await expect(page.getByTestId('interrupt-count')).toHaveText('0');
          await expect(page.getByTestId('send')).toBeEnabled();
          expect(fixture.requests).toHaveLength(0);
          expect(await durableEffects(fixture)).toBe(0);
        } finally {
          release();
        }
      });
    },
  );
});

test('a completed answer restores after reload with zero additional model or effect calls', async ({
  page,
}, info) => {
  await withDurableCluster(
    info.project.metadata['provider'] as 'openai' | 'azure',
    async (cluster) => {
      const fixture = await cluster.start();
      await withRoutedEndpoint(`${fixture.url}/run`, async (endpoint) => {
        await pending(page, endpoint.url);
        await page.getByTestId('resume').click();
        await expect(createAppDriver(page).assistant()).toHaveText(
          'Hello from .NET',
        );
        await createAppDriver(page).expectIdle();

        await page.reload();
        await refresh(page, 'Completed');

        await expect(createAppDriver(page).assistant()).toHaveText(
          'Hello from .NET',
        );
        await expect(page.getByTestId('interrupt-count')).toHaveText('0');
        expect(endpoint.requests).toHaveLength(2);
        expect(fixture.requests).toHaveLength(1);
        expect(await durableEffects(fixture)).toBe(1);
      });
    },
  );
});

test('a completed effect with unavailable final output shows status without inventing an answer', async ({
  page,
}, info) => {
  await withDurableCluster(
    info.project.metadata['provider'] as 'openai' | 'azure',
    async (cluster) => {
      const fixture = await cluster.start();
      await withRoutedEndpoint(`${fixture.url}/run`, async (endpoint) => {
        await pending(page, endpoint.url);
        await control(fixture, 'fail-terminal');
        await page.getByTestId('resume').click();
        await expect(page.getByTestId('recovery-required')).toHaveText('true');

        await page.reload();
        await refresh(page, 'CompletedAnswerUnavailable');

        await expect(createAppDriver(page).assistant()).toBeEmpty();
        await expect(page.getByTestId('interrupt-count')).toHaveText('0');
        await expect(page.getByTestId('resume')).toBeDisabled();
        await expect(page.getByTestId('decline')).toBeDisabled();
        await expect(page.getByTestId('cancel')).toBeDisabled();
        expect(fixture.requests).toHaveLength(1);
        expect(await durableEffects(fixture)).toBe(1);
      });
    },
  );
});

test('unknown effects require separate operator authority and terminal reconciliation fences late output', async ({
  page,
  request,
}, info) => {
  await withDurableCluster(
    info.project.metadata['provider'] as 'openai' | 'azure',
    async (cluster) => {
      const first = await cluster.start({
        Workflow: 'confirm-marker',
        CaptureGate: 'terminal',
      });
      const second = await cluster.start();
      await withRoutedEndpoint(`${first.url}/run`, async (endpoint) => {
        await pending(page, endpoint.url);
        const original = JSON.parse(endpoint.requests[0]);
        const lookup = await fetch(
          `${first.url}/threads/${original.threadId}/recovery`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Fixture-Principal': 'alice',
            },
            body: JSON.stringify({
              system: 'Runtime smoke system prompt.',
              tools: original.tools,
              forwardedProps: original.forwardedProps,
            }),
          },
        );
        const envelope = await lookup.json();
        const advancing = fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Fixture-Principal': 'alice',
          },
          body: JSON.stringify({
            ...original,
            runId: crypto.randomUUID(),
            resume: envelope.snapshot.interrupts.map(
              ({ id }: { id: string }) => ({
                interruptId: id,
                status: 'resolved',
                payload: { approved: true },
              }),
            ),
          }),
        })
          .then((response) => response.text())
          .catch((cause: unknown) => {
            if (cause instanceof TypeError && cause.message === 'terminated')
              return undefined;
            throw cause;
          });
        await waitForStage(first, 'marker');
        endpoint.routeTo(`${second.url}/run`);
        await page.reload();
        await refresh(page, 'UnknownEffect');
        await expect(page.getByTestId('send')).toBeDisabled();
        await expect(page.getByTestId('resume')).toBeDisabled();
        await expect(page.getByTestId('decline')).toBeDisabled();
        await expect(page.getByTestId('cancel')).toBeDisabled();
        const origin = new URL(endpoint.url).origin;
        const ordinary = { 'X-Fixture-Principal': 'alice' };
        const operator = { 'X-Fixture-Principal': 'operator' };
        const limitedOperator = { 'X-Fixture-Principal': 'operator-bob' };
        const forbidden = await request.get(`${origin}/checkpoints?limit=1`, {
          headers: ordinary,
        });
        expect(forbidden.status()).toBe(403);
        const listing = await request.get(`${origin}/checkpoints?limit=1`, {
          headers: operator,
        });
        expect(listing.status()).toBe(200);
        const { items } = await listing.json();
        const checkpoint = items[0];
        const limitedList = await request.get(`${origin}/checkpoints?limit=1`, {
          headers: limitedOperator,
        });
        expect(limitedList.status()).toBe(200);
        expect((await limitedList.json()).items).toEqual([]);
        expect(
          (
            await request.get(`${origin}/checkpoints/${checkpoint.batchId}`, {
              headers: limitedOperator,
            })
          ).status(),
        ).toBe(404);
        const inspect = await request.get(
          `${origin}/checkpoints/${checkpoint.batchId}`,
          { headers: operator },
        );
        expect(inspect.status()).toBe(200);
        expect((await inspect.json()).audit).toEqual([]);
        const reconciliation = {
          expectedState: checkpoint.effectState,
          expectedGeneration: checkpoint.generation,
          expectedRevision: checkpoint.serverRevision,
          outcome: 'Unresolved',
          reason:
            'External investigation still cannot establish downstream status',
          evidenceReference: 'fixture://operator-review',
          externalQuiescenceAcknowledged: true,
        };
        const reconcileUrl = `${origin}/checkpoints/${checkpoint.batchId}/reconcile`;
        expect(
          (
            await request.post(reconcileUrl, {
              headers: limitedOperator,
              data: reconciliation,
            })
          ).status(),
        ).toBe(404);
        for (const invalid of [
          { evidenceReference: undefined },
          { evidenceReference: '' },
          { evidenceReference: 'x'.repeat(2049) },
          { reason: '' },
          { reason: 'x'.repeat(2001) },
        ]) {
          expect(
            (
              await request.post(reconcileUrl, {
                headers: operator,
                data: { ...reconciliation, ...invalid },
              })
            ).status(),
          ).toBe(400);
        }
        expect(
          (
            await request.post(reconcileUrl, {
              headers: ordinary,
              data: reconciliation,
            })
          ).status(),
        ).toBe(403);
        expect(
          (
            await request.post(reconcileUrl, {
              headers: operator,
              data: {
                ...reconciliation,
                externalQuiescenceAcknowledged: false,
              },
            })
          ).status(),
        ).toBe(400);
        expect(
          (
            await request.post(reconcileUrl, {
              headers: operator,
              data: {
                ...reconciliation,
                expectedRevision: checkpoint.serverRevision + 1,
              },
            })
          ).status(),
        ).toBe(409);

        expect(
          (
            await request.post(reconcileUrl, {
              headers: operator,
              data: reconciliation,
            })
          ).status(),
        ).toBe(200);
        await refresh(page, 'Reconciled: Unresolved');

        expect(
          (
            await request.post(reconcileUrl, {
              headers: operator,
              data: reconciliation,
            })
          ).status(),
        ).toBe(409);
        expect(await durableEffects(second)).toBe(0);
        expect(first.requests).toHaveLength(0);
        expect(second.requests).toHaveLength(0);
        // Deliberately contradict the external assertion: CAS cannot revoke already-issued dispatch permission.
        await control(first, 'release-checkpoint');
        await expect
          .poll(
            async () =>
              (await (await fetch(`${first.url}/__test/capture-stage`)).json())
                .stage,
          )
          .toBe('terminal');
        await control(first, 'release-capture');
        await advancing;
        await expect.poll(() => durableEffects(second)).toBe(1);
        await refresh(page, 'Reconciled: Unresolved');
        await expect(page.getByTestId('send')).toBeDisabled();
        await expect(page.getByTestId('interrupt-count')).toHaveText('0');
        await expect(createAppDriver(page).assistant()).toBeEmpty();
        expect(first.requests).toHaveLength(1);
        expect(second.requests).toHaveLength(0);
        const after = await request.get(
          `${origin}/checkpoints/${checkpoint.batchId}`,
          { headers: operator },
        );
        expect((await after.json()).audit).toMatchObject([
          { actor: 'operator', outcome: 'Unresolved' },
        ]);
      });
    },
  );
});

test('historical browser tools stay inert through recovered approval and a later complete generation', async ({
  page,
}, info) => {
  await withDurableCluster(
    info.project.metadata['provider'] as 'openai' | 'azure',
    async (cluster) => {
      const fixture = await cluster.start({ Workflow: 'after-tool' });
      fixture.mock.onMessage('Weather fixture', {
        toolCalls: [
          {
            id: 'historical-weather',
            name: 'getWeather',
            arguments: { city: 'Portland' },
          },
        ],
      });
      fixture.mock.onToolResult('historical-weather', {
        content: 'Weather result retained',
      });
      fixture.mock.onMessage('Hello fixture', { content: 'Hello from .NET' });
      await withRoutedEndpoint(`${fixture.url}/run`, async (endpoint) => {
        await open(page, endpoint.url, 'tool');
        await createAppDriver(page).send('Weather fixture');
        await expect(page.getByTestId('interrupt-count')).toHaveText('2');
        await expect(page.getByTestId('tool-count')).toHaveText('1');
        const checkpointRequest = JSON.parse(endpoint.requests[1]);
        expect(fixture.requests).toHaveLength(1);

        await page.reload();
        await refresh(page, 'Pending');

        await expect(page.getByTestId('tool-count')).toHaveText('0');
        expect(fixture.requests).toHaveLength(1);
        expect(await durableEffects(fixture)).toBe(0);
        await page.getByTestId('resume').click();
        await expect(createAppDriver(page).assistant()).toHaveText(
          'Weather result retained',
        );
        await createAppDriver(page).expectIdle();
        await expect(page.getByTestId('tool-count')).toHaveText('0');
        const recoveredRequest = JSON.parse(endpoint.requests[2]);
        expect(recoveredRequest.messages).toEqual(checkpointRequest.messages);
        expect(recoveredRequest.tools).toEqual(checkpointRequest.tools);
        expect(recoveredRequest.forwardedProps).toEqual(
          checkpointRequest.forwardedProps,
        );
        expect(fixture.requests).toHaveLength(2);
        expect(await durableEffects(fixture)).toBe(1);
        await createAppDriver(page).send('Hello fixture');
        await expect(page.getByTestId('interrupt-count')).toHaveText('2');
        await expect(page.getByTestId('tool-count')).toHaveText('0');
        expect(fixture.requests).toHaveLength(2);
        expect(await durableEffects(fixture)).toBe(1);
        await page.getByTestId('resume').click();
        await expect(createAppDriver(page).assistant()).toHaveText(
          'Hello from .NET',
        );
        await createAppDriver(page).expectIdle();
        await expect(page.getByTestId('tool-count')).toHaveText('0');
        expect(fixture.requests).toHaveLength(3);
        expect(await durableEffects(fixture)).toBe(2);
      });
    },
  );
});

test('structured assistant history restores through the trusted schema without replaying an action', async ({
  page,
}, info) => {
  await withDurableCluster(
    info.project.metadata['provider'] as 'openai' | 'azure',
    async (cluster) => {
      const fixture = await cluster.start();
      fixture.mock.onMessage('Structured recovery', {
        content: JSON.stringify({
          answer: 'Restored trusted answer',
          count: 7,
        }),
      });
      await withRoutedEndpoint(`${fixture.url}/run`, async (endpoint) => {
        await open(page, endpoint.url, 'structured');
        await createAppDriver(page).send('Structured recovery');
        await expect(page.getByTestId('interrupt-count')).toHaveText('2');
        const original = JSON.parse(endpoint.requests[0]);
        await page.getByTestId('resume').click();
        await expect(page.getByTestId('structured-answer')).toHaveText(
          'Restored trusted answer',
        );
        await createAppDriver(page).expectIdle();

        await page.reload();
        await refresh(page, 'Completed');

        await expect(page.getByTestId('structured-answer')).toHaveText(
          'Restored trusted answer',
        );
        await expect(page.getByTestId('structured-count')).toHaveText('7');
        await expect(page.getByTestId('interrupt-count')).toHaveText('0');
        expect(JSON.parse(endpoint.requests[1]).forwardedProps).toEqual(
          original.forwardedProps,
        );
        expect(endpoint.requests).toHaveLength(2);
        expect(fixture.requests).toHaveLength(1);
        expect(await durableEffects(fixture)).toBe(1);
      });
    },
  );
});

test('native preparation without a progress prelude recovers its unacknowledged claim after worker death', async ({
  page,
}, info) => {
  await withDurableCluster(
    info.project.metadata['provider'] as 'openai' | 'azure',
    async (cluster) => {
      const first = await cluster.start({ Workflow: 'confirm-before' });
      const second = await cluster.start();
      await withRoutedEndpoint(`${first.url}/run`, async (endpoint) => {
        await pending(page, endpoint.url);
        await page.getByTestId('resume').click();
        await waitForStage(first, 'before');
        await expect(page.getByTestId('interrupt-count')).toHaveText('2');
        await first.stop();
        endpoint.routeTo(`${second.url}/run`);
        await createAppDriver(page).expectIdle();

        await refresh(page, 'Busy');

        await expect(page.getByTestId('send')).toBeDisabled();
        await expect(page.getByTestId('resume')).toBeDisabled();
        await expect(page.getByTestId('decline')).toBeDisabled();
        await expect(page.getByTestId('cancel')).toBeDisabled();
        expect(second.requests).toHaveLength(0);
        expect(await durableEffects(second)).toBe(0);
        await control(second, 'expire-lease');
        await refresh(page, 'Pending');
        expect(second.requests).toHaveLength(0);
        await page.getByTestId('resume').click();
        await expect(createAppDriver(page).assistant()).toHaveText(
          'Hello from .NET',
        );
        expect(second.requests).toHaveLength(1);
        expect(await durableEffects(second)).toBe(1);
      });
    },
  );
});
