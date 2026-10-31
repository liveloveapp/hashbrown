import { expect, test } from '@playwright/test';
import { createAppDriver } from '../harness/app-driver';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Load the isolated producer driver through its native ESM boundary. */
async function startHost() {
  const moduleUrl = pathToFileURL(
    resolve('tools/conformance/agent-frameworks/python-recipe/controller.mjs'),
  ).href;
  const driver = await import(moduleUrl);
  return driver.startPydanticHost() as Promise<{
    url: string;
    state: (id: string) => Promise<Record<string, unknown>>;
    waitFor: (
      id: string,
      predicate: (state: Record<string, unknown>) => boolean,
    ) => Promise<unknown>;
    release: (id: string) => Promise<unknown>;
    cancel: (id: string) => Promise<unknown>;
    stop: () => Promise<void>;
  }>;
}

for (const scenario of ['streaming', 'server-tool', 'client-tool']) {
  test(`Pydantic recipe ASGI endpoint ${scenario}`, async ({ page }) => {
    const host = await startHost();
    const driver = createAppDriver(page);

    try {
      await page.goto(
        `/?${new URLSearchParams({ runUrl: `${host.url}/agent`, scenario: scenario === 'streaming' ? 'plain' : 'tool', retries: '0' })}`,
      );
      const threadId = await page.getByTestId('recovery-thread').innerText();
      await driver.send(scenario);
      if (scenario !== 'client-tool') {
        await host.waitFor(threadId, (state) =>
          scenario === 'streaming'
            ? state['streamEntered'] === true
            : state['entered'] === 1,
        );
        await driver.expectLoading();
        if (scenario === 'streaming')
          await expect(driver.assistant()).toHaveText('Pydantic streaming ');
        else {
          await expect
            .poll(
              async () =>
                JSON.parse(
                  await page.getByTestId('server-tool-calls').innerText(),
                ).length,
            )
            .toBe(1);
          expect((await host.state(threadId))['completed']).toBe(0);
        }
        await host.release(threadId);
      }
      await driver.expectIdle();

      await expect(driver.error()).toHaveText('');
      await expect(driver.toolCount()).toHaveText(
        scenario === 'client-tool' ? '1' : '0',
      );
      await expect(driver.assistant()).toHaveText(
        scenario === 'streaming'
          ? 'Pydantic streaming answer.'
          : scenario === 'server-tool'
            ? 'Tool result: server-result:London'
            : /Tool result:/,
      );
      const state = await host.state(threadId);
      if (scenario === 'server-tool') {
        expect(state['completed']).toBe(1);
        await driver.send('client-tool');
        await driver.expectIdle();
        await expect(driver.toolCount()).toHaveText('1');
        await expect(driver.assistant()).toContainText('temperatureC');
        await driver.expectIdle();
        const continuation = await host.state(threadId);
        expect(JSON.stringify(continuation['modelRequests'])).toContain(
          'server-result:London',
        );
        expect(JSON.stringify(continuation['modelRequests'])).toContain(
          'temperatureC',
        );
      }
      if (scenario === 'client-tool') {
        expect(JSON.stringify(state['modelRequests'])).toContain(
          'temperatureC',
        );
        await expect(page.getByTestId('tool-observations')).toHaveText(
          '["London"]',
        );
      }
    } finally {
      await page.goto('about:blank');
      await host.stop();
    }
  });
}

for (const scenario of [
  'failure',
  'cancel',
  'disconnect',
  'server-same-name',
]) {
  test(`Pydantic recipe ASGI ${scenario} retains its native boundary`, async ({
    page,
  }) => {
    const host = await startHost();
    const driver = createAppDriver(page);

    try {
      await page.goto(
        `/?${new URLSearchParams({ runUrl: `${host.url}/agent`, scenario: scenario === 'failure' && test.info().project.name === 'angular' ? 'terminal-tool' : 'tool', retries: '0' })}`,
      );
      const threadId = await page.getByTestId('recovery-thread').innerText();
      await driver.send(
        scenario === 'cancel' || scenario === 'disconnect'
          ? 'server-tool'
          : scenario,
      );
      if (scenario === 'cancel' || scenario === 'disconnect') {
        await host.waitFor(threadId, (state) => state['entered'] === 1);
        await driver.expectLoading();
        if (scenario === 'cancel') await host.cancel(threadId);
        else await driver.stop();
        await driver.expectIdle();
        await host.waitFor(
          threadId,
          (state) => state['cancelled'] === 1 && state['settled'] === true,
        );
        await host.release(threadId);
      } else {
        await expect(driver.error()).toContainText(
          scenario === 'failure'
            ? 'controlled callback failure'
            : 'conflicts with existing tool',
        );
        await driver.expectIdle();
      }

      await expect(driver.toolCount()).toHaveText('0');
      const state = await host.state(threadId);
      expect(state['completed']).toBe(0);
      if (scenario === 'failure' || scenario === 'cancel') {
        const calls = JSON.parse(
          await page.getByTestId('server-tool-calls').innerText(),
        );
        expect(calls[0]?.outcome).toBe(
          scenario === 'failure' ? 'failure' : 'cancelled',
        );
        expect(JSON.stringify(calls)).not.toContain('b4.');
      }
      if (scenario === 'failure') expect(state['failed']).toBe(1);
      if (scenario === 'server-same-name') {
        expect(state['entered']).toBe(0);
        expect(state['modelRequests']).toEqual([]);
      }
    } finally {
      await page.goto('about:blank');
      await host.stop();
    }
  });
}

for (const approved of [true, false]) {
  test(`Pydantic recipe native approval ${approved ? 'accepts' : 'denies'} in the browser`, async ({
    page,
  }) => {
    const host = await startHost();
    const driver = createAppDriver(page);

    try {
      await page.goto(
        `/?${new URLSearchParams({ runUrl: `${host.url}/agent`, scenario: 'tool', retries: '0' })}`,
      );
      await driver.send('approval');
      await expect(page.getByTestId('interrupt-count')).toHaveText('1');
      await page.getByTestId(approved ? 'resume' : 'decline').click();
      await driver.expectIdle();
      await expect(page.getByTestId('interrupt-count')).toHaveText('0');

      const threadId = await page.getByTestId('recovery-thread').innerText();
      await expect
        .poll(async () => {
          const calls = JSON.parse(
            await page.getByTestId('server-tool-calls').innerText(),
          );
          return calls.at(-1)?.outcome;
        })
        .toBe(approved ? 'success' : 'denied');
      expect((await host.state(threadId))['completed']).toBe(approved ? 1 : 0);
      await expect(driver.toolCount()).toHaveText('0');
      await expect(driver.error()).toHaveText('');
    } finally {
      await page.goto('about:blank');
      await host.stop();
    }
  });
}

test('Pydantic recipe standard progress and state are live before server completion', async ({
  page,
}) => {
  const host = await startHost();
  const driver = createAppDriver(page);

  try {
    await page.goto(
      `/?${new URLSearchParams({ runUrl: `${host.url}/agent`, scenario: 'plain', retries: '0' })}`,
    );
    const threadId = await page.getByTestId('recovery-thread').innerText();
    await driver.send('protocol');
    await expect(page.getByTestId('activity-messages')).toContainText(
      '"progress":0',
    );
    await expect(page.getByTestId('shared-state')).toHaveText('{"progress":0}');
    await driver.expectLoading();
    expect((await host.state(threadId))['completed']).toBe(0);
    await host.release(threadId);
    await driver.expectIdle();

    await expect(page.getByTestId('activity-messages')).toContainText(
      '"progress":1',
    );
    await expect(page.getByTestId('shared-state')).toHaveText('{"progress":1}');
    await expect(driver.error()).toHaveText('');
    expect((await host.state(threadId))['completed']).toBe(1);
  } finally {
    await page.goto('about:blank');
    await host.stop();
  }
});

test('Pydantic recipe overlapping browser threads stay isolated on one endpoint', async ({
  page,
  context,
}) => {
  const host = await startHost();
  const other = await context.newPage();
  const first = createAppDriver(page);
  const second = createAppDriver(other);

  try {
    const url = `/?${new URLSearchParams({ runUrl: `${host.url}/agent`, scenario: 'tool', retries: '0' })}`;
    await page.goto(url);
    await other.goto(url);
    const firstId = await page.getByTestId('recovery-thread').innerText();
    const secondId = await other.getByTestId('recovery-thread').innerText();
    expect(secondId).not.toBe(firstId);
    await first.send('server-tool');
    await second.send('server-tool');
    await host.waitFor(firstId, (state) => state['entered'] === 1);
    await host.waitFor(secondId, (state) => state['entered'] === 1);
    await host.release(firstId);
    await first.expectIdle();
    await second.expectLoading();
    expect((await host.state(secondId))['completed']).toBe(0);
    await host.release(secondId);
    await second.expectIdle();

    for (const [target, id] of [
      [page, firstId],
      [other, secondId],
    ] as const) {
      const calls = JSON.parse(
        await target.getByTestId('server-tool-calls').innerText(),
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].toolCallId).toBe(`${id}-server`);
      expect(calls[0].outcome).toBe('success');
    }
  } finally {
    await page.goto('about:blank');
    await other.close();
    await host.stop();
  }
});
