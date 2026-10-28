import { saveWorkbenchCapture } from './workbench-capture-file';
import { assertWorkbenchSavedTextInspection } from './workbench-history-inspection';
import type { RunAgentInput } from '@ag-ui/core';
import { type Browser, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import {
  workbenchHistoryKey,
  type WorkbenchHistoryObservation,
} from '../../examples/quickstart/runtime/workbench-history';
import {
  expectNoHorizontalOverflow,
  expectWorkbenchDefaultLayout,
} from './verify-workbench-layout';

/** Exercises public history controls against genuine SDK observations and actual provider requests. */
export async function verifyHistoryWorkbench(options: {
  readonly browser: Browser;
  readonly framework: string;
  readonly lesson: 'message-history' | 'save-text-conversations';
  readonly origin: string;
  readonly work: string;
  readonly live: boolean;
  readonly recording: boolean;
  readonly requests: readonly RunAgentInput[];
  readonly nativeRequests: readonly Record<string, unknown>[];
  readonly outcome: (
    value: 'success' | 'error' | 'length' | 'no-finish',
  ) => void;
}) {
  const { framework, lesson, live, recording, work } = options;
  const saved = lesson === 'save-text-conversations';
  const page = await options.browser.newPage({
    viewport: { width: 1600, height: 1000 },
    ...(recording
      ? { recordVideo: { dir: work, size: { width: 1600, height: 1000 } } }
      : {}),
  });
  const base = `${framework}-${lesson}-${live ? 'live' : 'fixture'}`;
  const started = Date.now();
  const phases: Record<string, number> = {};
  const mark = (name: string) => {
    phases[name] = (Date.now() - started) / 1000;
  };
  const hold = async () => {
    if (recording) await page.waitForTimeout(1400);
  };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let httpRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/workbench/'))
      httpRequests++;
  });
  const start = options.requests.length;
  const nativeStart = options.nativeRequests.length;
  const count = () => options.requests.length - start;
  const storageEvents: string[] = [];
  await page.exposeFunction('__historyStorageEvent', (event: string) =>
    storageEvents.push(event),
  );
  await page.addInitScript(() => {
    for (const method of ['setItem', 'removeItem'] as const) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (key: string, value?: string) {
        if (key.startsWith('hashbrown.workbench.saved-text.v1.'))
          void (
            window as unknown as {
              __historyStorageEvent: (event: string) => Promise<void>;
            }
          ).__historyStorageEvent(`${method}:${key}`);
        return original.call(this, key, value as string);
      };
    }
  });
  let succeeded = false;
  try {
    await page.goto(`${options.origin}/${framework}.html?lesson=${lesson}`);
    const root = page.locator('.wb:visible');
    const button = (name: string) =>
      root.getByRole('button', { name, exact: true });
    const send = root.locator('[data-send]');
    const tab = async (name: string) => {
      await root.getByRole('tab', { name, exact: true }).click();
    };
    const observed = async () => {
      await tab('History');
      return JSON.parse(
        await root.locator('.wb-inspector .wb-inspection pre').innerText(),
      ) as WorkbenchHistoryObservation;
    };
    const complete = async () => {
      await expect(root.locator('.wb-chat .wb-panel-head')).toContainText(
        'complete',
        { timeout: 90_000 },
      );
      await expect(send).toBeEnabled();
    };
    const newConversation = async () => {
      const selected = root.locator('.wb-nav [aria-pressed=true]');
      const previous = await selected.innerText();
      await button('New conversation').click();
      await expect(selected).not.toHaveText(previous);
      await expect(send).toBeEnabled();
    };
    const storage = () =>
      page.evaluate(
        (keys) => keys.map((key) => localStorage.getItem(key)),
        [workbenchHistoryKey('Lighthouse'), workbenchHistoryKey('Harbor')],
      );
    const savedInspection = async (
      slot: 'Lighthouse' | 'Harbor',
      action: string,
      canSave: boolean,
      successfulGeneration = canSave,
    ) => {
      await tab('Saved text');
      const bytes = (await storage())[slot === 'Lighthouse' ? 0 : 1];
      assertWorkbenchSavedTextInspection(
        JSON.parse(
          await root.locator('.wb-inspector .wb-inspection pre').innerText(),
        ),
        JSON.parse(
          await root.locator('.wb-inspector [data-detail] pre').innerText(),
        ),
        { slot, encoded: bytes, action, canSave, successfulGeneration },
      );
    };
    await expect(send).toBeEnabled();
    await expectWorkbenchDefaultLayout(page);
    expect((await observed()).messages).toEqual([]);
    expect(count()).toBe(0);
    expect(httpRequests).toBe(0);
    expect(storageEvents).toEqual([]);
    await hold();
    mark('firstRequest');
    await send.click();
    await complete();
    mark('firstComplete');
    const original = await observed();
    expect(original.finishReason).toBe('stop');
    expect(original.messages).toHaveLength(2);
    expect(original.messages.at(-1)?.['content']).toContain('Lighthouse');
    await expect(root.locator('[data-source]')).toHaveText(
      live ? 'Live model' : 'Test fixture',
    );
    await hold();
    let stored: (string | null)[] = [];
    if (saved) {
      await button('Save text').click();
      await savedInspection('Lighthouse', 'save', true);
      await hold();
      mark('firstSave');
      stored = await storage();
      expect(JSON.parse(stored[0] as string).messages).toHaveLength(2);
      expect(stored[1]).toBeNull();
      await newConversation();
      await root
        .getByLabel('Saved text', { exact: true })
        .selectOption('Harbor');
      await root
        .getByRole('textbox', { name: 'Your message', exact: true })
        .fill('Name this two-step plan Harbor and explain it briefly.');
      await hold();
      mark('harbor');
      await send.click();
      await complete();
      expect((await observed()).messages.at(-1)?.['content']).toContain(
        'Harbor',
      );
      expect(options.requests.at(-1)?.threadId).not.toBe(
        options.requests[start].threadId,
      );
      await button('Save text').click();
      await savedInspection('Harbor', 'save', true);
      await hold();
      mark('secondSave');
      stored = await storage();
      expect(stored.every(Boolean)).toBe(true);
      const writes = storageEvents.length;
      await hold();
      mark('reload');
      await page.reload();
      await expect(send).toBeEnabled();
      expect((await observed()).messages).toEqual([]);
      await tab('Requests');
      await expect(
        root.locator('.wb-inspector .wb-inspection'),
      ).not.toContainText('Harbor');
      expect(count()).toBe(2);
      expect(httpRequests).toBe(2);
      expect(await storage()).toEqual(stored);
      expect(storageEvents).toHaveLength(writes);
      await savedInspection('Lighthouse', 'select-slot', false);
      await hold();
      await button('Load text').click();
      await expect.poll(async () => (await observed()).messages.length).toBe(2);
      await savedInspection('Lighthouse', 'load', false);
      await hold();
      mark('load');
      await expect(button('Save text')).toBeDisabled();
      expect(await storage()).toEqual(stored);
      expect(storageEvents).toHaveLength(writes);
    } else {
      await button('Keep completed text').click();
      await hold();
      mark('keep');
      await button('Clear messages').click();
      await expect.poll(async () => (await observed()).messages.length).toBe(0);
      await hold();
      mark('clear');
      await button('Restore kept text').click();
      await expect.poll(async () => (await observed()).messages.length).toBe(2);
      await hold();
      mark('restore');
      await expect(button('Keep completed text')).toBeDisabled();
    }
    const restored = await observed();
    expect(restored.messages.map((message) => message['content'])).toEqual(
      original.messages.map((message) => message['content']),
    );
    for (const message of restored.messages) {
      expect(typeof message['id']).toBe('string');
      expect(message['id']).not.toBe('');
      expect(original.messages.map((value) => value['id'])).not.toContain(
        message['id'],
      );
    }
    expect(count()).toBe(saved ? 2 : 1);
    expect(httpRequests).toBe(saved ? 2 : 1);
    if (saved) await savedInspection('Lighthouse', 'load', false);
    await hold();
    mark('followup');
    await button('Follow-up').click();
    await send.click();
    await complete();
    mark('secondComplete');
    const final = await observed();
    expect(final.messages.at(-1)?.['content']).toContain('Lighthouse');
    if (saved) await savedInspection('Lighthouse', 'load', true);
    await hold();
    if (saved) {
      await button('Save text').click();
      await savedInspection('Lighthouse', 'save', true);
      await hold();
      mark('finalSave');
    }
    const captured = options.requests.slice(start);
    expect(captured).toHaveLength(saved ? 3 : 2);
    expect(httpRequests).toBe(captured.length);
    for (const request of captured) {
      expect(request.tools).toHaveLength(0);
      expect(request.messages.some((message) => message.role === 'tool')).toBe(
        false,
      );
      expect(
        (
          request.forwardedProps as {
            hashbrown: { ui: boolean; responseSchema?: unknown };
          }
        ).hashbrown,
      ).toMatchObject({ ui: false });
    }
    const followup = captured.at(-1) as RunAgentInput;
    expect(
      followup.messages.filter((message) => message.role === 'user'),
    ).toHaveLength(2);
    expect(
      followup.messages.find((message) => message.role === 'assistant')
        ?.content,
    ).toBe(original.messages.at(-1)?.['content']);
    expect(
      JSON.stringify(
        followup.messages.filter(
          (message) => message.role === 'user' || message.role === 'assistant',
        ),
      ),
    ).not.toContain('Harbor');
    expect(followup.threadId === captured[0].threadId).toBe(!saved);
    expect(followup.runId).not.toBe(captured[0].runId);
    if (saved) expect(followup.threadId).not.toBe(captured[1].threadId);
    if (!live)
      expect(options.nativeRequests.slice(nativeStart)).toHaveLength(
        captured.length,
      );
    if (saved) {
      expect(new Set(captured.map((request) => request.threadId)).size).toBe(3);
      await tab('Requests');
      const currentRequests = await root
        .locator('.wb-inspector .wb-inspection')
        .innerText();
      expect(currentRequests).not.toContain(captured[0].runId);
      expect(currentRequests).not.toContain(captured[1].runId);
      await savedInspection('Lighthouse', 'save', true);
    }
    await expect.poll(() => storageEvents.length).toBe(saved ? 3 : 0);
    const beforeReplay = {
      count: count(),
      http: httpRequests,
      writes: storageEvents.length,
      stored: await storage(),
    };
    await hold();
    mark('replay');
    await button('Play').click();
    await expect(send).toBeDisabled();
    await hold();
    const pause = button('Pause');
    if (await pause.count()) await pause.click();
    // The public range control seeks actual captured events; no store injection.
    const slider = root.getByRole('slider', { name: 'Seek captured event' });
    await slider.fill('0');
    for (const name of saved
      ? ['Save text', 'Load text', 'Clear saved text']
      : ['Keep completed text', 'Clear messages', 'Restore kept text']) {
      await expect(button(name)).toBeDisabled();
      await button(name).dispatchEvent('click');
    }
    if (saved)
      await expect(
        root.getByLabel('Saved text', { exact: true }),
      ).toBeDisabled();
    if (saved) {
      const lastEvent = await slider.getAttribute('max');
      if (lastEvent === null)
        throw new Error('Missing public captured-event range');
      await slider.fill(lastEvent);
      await savedInspection('Lighthouse', 'save', false, true);
    }
    await hold();
    await button('Return to live').click();
    await hold();
    mark('returnedLive');
    expect(count()).toBe(beforeReplay.count);
    expect(httpRequests).toBe(beforeReplay.http);
    expect(storageEvents).toHaveLength(beforeReplay.writes);
    expect(await storage()).toEqual(beforeReplay.stored);
    await observed();
    if (saved) await savedInspection('Lighthouse', 'save', true);
    await hold();
    await page.screenshot({
      path: resolve(work, `${base}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    if (!live) {
      for (const outcome of ['error', 'length', 'no-finish'] as const) {
        await newConversation();
        options.outcome(outcome);
        await send.click();
        await expect(root.locator('.wb-chat .wb-panel-head')).toContainText(
          'error',
          { timeout: 30_000 },
        );
        await expect(
          button(saved ? 'Save text' : 'Keep completed text'),
        ).toBeDisabled();
        expect(await storage()).toEqual(beforeReplay.stored);
      }
      options.outcome('success');
      await newConversation();
      await send.click();
      await expect(button('Stop')).toBeEnabled();
      await page.waitForTimeout(200);
      await button('Stop').click();
      await expect(root.locator('.wb-chat .wb-panel-head')).toContainText(
        'cancelled',
      );
      await expect(
        button(saved ? 'Save text' : 'Keep completed text'),
      ).toBeDisabled();
      expect(await storage()).toEqual(beforeReplay.stored);
      await newConversation();
      await page.route(
        '**/api/workbench/**',
        (route) =>
          route.fulfill({
            status: 503,
            body: 'Intentional fixture HTTP failure',
          }),
        { times: 1 },
      );
      await send.click();
      await expect(root.getByRole('alert').first()).toBeVisible();
      await button('First prompt').click();
      await send.click();
      await complete();
      if (saved) {
        // Change storage externally after the cached read; Load must read fresh bytes.
        await page.evaluate(
          ({ key, encoded }) => localStorage.setItem(key, encoded),
          {
            key: workbenchHistoryKey('Lighthouse'),
            encoded: stored[1] as string,
          },
        );
        await button('Load text').click();
        await expect
          .poll(async () => JSON.stringify((await observed()).messages))
          .toContain('Harbor');
        for (const invalid of ['{broken', '{"version":99,"messages":[]}']) {
          await page.evaluate(
            ({ key, value }) => localStorage.setItem(key, value),
            { key: workbenchHistoryKey('Lighthouse'), value: invalid },
          );
          await button('Load text').click();
          await expect(root.getByRole('alert').first()).toBeVisible();
          expect((await storage())[0]).toBe(invalid);
          await button('First prompt').click();
          await send.click();
          await complete();
          await button('Save text').click();
          expect((await storage())[0]).toBe(invalid);
          await button('Clear saved text').click();
          expect((await storage())[0]).toBeNull();
          await button('Save text').click();
        }
        for (const method of [
          'getItem',
          'setItem',
          'removeItem',
          'getter',
        ] as const) {
          await newConversation();
          await page.evaluate((method) => {
            const holder = window as unknown as {
              __restoreHistoryStorage: () => void;
            };
            if (method === 'getter') {
              const descriptor = Object.getOwnPropertyDescriptor(
                window,
                'localStorage',
              ) as PropertyDescriptor;
              Object.defineProperty(window, 'localStorage', {
                configurable: true,
                get() {
                  throw new Error('Intentional storage getter failure');
                },
              });
              holder.__restoreHistoryStorage = () =>
                Object.defineProperty(window, 'localStorage', descriptor);
            } else {
              const original = Storage.prototype[method];
              Object.defineProperty(Storage.prototype, method, {
                configurable: true,
                writable: true,
                value: function (this: Storage, key: string, value?: string) {
                  if (key.startsWith('hashbrown.workbench.saved-text.v1.'))
                    throw new Error(`Intentional ${method} failure`);
                  return Reflect.apply(original, this, [key, value]);
                },
              });
              holder.__restoreHistoryStorage = () => {
                Object.defineProperty(Storage.prototype, method, {
                  configurable: true,
                  writable: true,
                  value: original,
                });
              };
            }
          }, method);
          if (method === 'getItem' || method === 'getter')
            await root
              .getByLabel('Saved text', { exact: true })
              .selectOption('Harbor');
          await send.click();
          await complete();
          await button(
            method === 'removeItem' ? 'Clear saved text' : 'Save text',
          ).click();
          await expect(root.getByRole('alert').first()).toBeVisible();
          await page.evaluate(() =>
            (
              window as unknown as { __restoreHistoryStorage: () => void }
            ).__restoreHistoryStorage(),
          );
          await button('Follow-up').click();
          await send.click();
          await complete();
        }
      }
    }
    if (!recording) {
      await page.setViewportSize({ width: 390, height: 844 });
      await expectNoHorizontalOverflow(page);
    }
    expect(errors).toEqual([]);
    if (process.env['WORKBENCH_RECORD'] === '1')
      await saveWorkbenchCapture(page, resolve(work, `${base}.capture.json`));
    succeeded = true;
    return {
      framework,
      lesson,
      passed: true,
      source: live ? 'provider' : 'test-fixture',
      provider: 'openai',
      phases,
      requests: captured.length,
      httpRequests: captured.length,
      replayRequests: 0,
      replayStorageWrites: 0,
      storageWrites: beforeReplay.writes,
      hardReload: saved,
      eventDelayMs: recording ? 20 : 0,
    };
  } catch (error) {
    await page
      .screenshot({
        path: resolve(work, `${base}-failure.png`),
        fullPage: true,
      })
      .catch(() => undefined);
    writeFileSync(
      resolve(work, `${base}-failure.json`),
      JSON.stringify(
        {
          framework,
          lesson,
          phases,
          requests: count(),
          httpRequests,
          storageEvents,
          errors,
          error: String(error),
          publicUI: await page
            .locator('body')
            .innerText()
            .catch(() => ''),
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    options.outcome('success');
    const video = page.video();
    await page.close();
    if (video)
      await video.saveAs(
        resolve(work, `${base}${succeeded ? '' : '-failed'}.webm`),
      );
  }
}
