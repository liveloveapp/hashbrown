import { readInspectorJson } from './verify-inspector-modes';
import { saveWorkbenchCapture } from './workbench-capture-file';
import type { RunAgentInput } from '@ag-ui/core';
import { type Browser, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  WorkbenchServerHistoryState,
  WorkbenchServerLesson,
} from '../../examples/quickstart/runtime/workbench-server-history';
import {
  expectNoHorizontalOverflow,
  expectWorkbenchDefaultLayout,
} from './verify-workbench-layout';

/** Exercises real SDK text, explicit server persistence and access boundaries through public controls. */
export async function verifyServerWorkbench(options: {
  readonly browser: Browser;
  readonly framework: string;
  readonly lesson: WorkbenchServerLesson;
  readonly origin: string;
  readonly work: string;
  readonly live: boolean;
  readonly recording: boolean;
  readonly requests: readonly RunAgentInput[];
}) {
  const { framework, lesson, live, recording, work } = options;
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
    if (recording) await page.waitForTimeout(1800);
  };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let http = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/workbench/server/'))
      http++;
  });
  const start = options.requests.length;
  const count = () => options.requests.length - start;
  let succeeded = false;
  try {
    await page.goto(`${options.origin}/${framework}.html?lesson=${lesson}`);
    const root = page.locator('.wb:visible');
    const button = (name: string) =>
      root.getByRole('button', { name, exact: true });
    const send = root.locator('[data-send]');
    const tab = async (name: string) => {
      await root
        .getByRole('tablist', { name: 'Inspector views', exact: true })
        .getByRole('tab', { name, exact: true })
        .click();
    };
    const state = async () => {
      await tab('Server');
      const source = await readInspectorJson(root, 'top');
      const detail = await readInspectorJson(root, 'bottom');
      return { ...source, ...detail } as WorkbenchServerHistoryState;
    };
    const messages = async () => {
      await tab('History');
      return (
        JSON.parse(
          await root.locator('.wb-inspector .wb-inspection pre').innerText(),
        ) as { messages: { id: string; role: string; content: string }[] }
      ).messages;
    };
    const complete = async () => {
      await expect(root.locator('.wb-chat .wb-panel-head')).toContainText(
        'complete',
        { timeout: 90_000 },
      );
      await expect(send).toBeEnabled();
    };
    await expect(button('Start local session')).toBeEnabled();
    await expect(send).toBeDisabled();
    await expectWorkbenchDefaultLayout(page);
    expect(count()).toBe(0);
    await hold();
    if (lesson === 'public-endpoint') {
      await button('Try anonymous request').click();
      await expect
        .poll(async () => (await state()).operations.at(-1)?.status)
        .toBe(401);
      expect(count()).toBe(0);
      await tab('Access');
      await hold();
      mark('denied');
    }
    await button('Start local session').click();
    await expect(button('Load server thread')).toBeEnabled();
    await hold();
    mark('session');
    await button('Load server thread').click();
    await expect(send).toBeEnabled();
    const loaded = await state();
    expect(loaded.version).toBe(0);
    expect(loaded.snapshot?.messages).toEqual([]);
    expect(count()).toBe(0);
    await expect(button('Save server text')).toBeDisabled();
    await hold();
    mark('loaded');
    mark('authorized');
    if (lesson === 'public-endpoint') await tab('Access');
    await send.click();
    await expect(button('Save server text')).toBeDisabled();
    await complete();
    expect(options.requests[start].threadId).toBe(loaded.threadId);
    const original = await messages();
    expect(original).toHaveLength(2);
    expect(original.at(-1)?.content).toContain('Lighthouse');
    await expect(root.locator('[data-source]')).toHaveText(
      live ? 'Live model' : 'Test fixture',
    );
    await tab(lesson === 'public-endpoint' ? 'Access' : 'Server');
    await hold();
    mark('firstComplete');
    if (lesson === 'server-threads') {
      await button('Save server text').click();
      await expect.poll(async () => (await state()).version).toBe(1);
      const firstSaved = await state();
      expect(firstSaved.snapshot?.messages).toEqual(
        original.map(({ role, content }) => ({ role, content })),
      );
      await hold();
      mark('saved');
      await page.reload();
      await expect(button('Load server thread')).toBeEnabled();
      await expect(send).toBeDisabled();
      expect(await messages()).toEqual([]);
      await tab('Requests');
      await expect(
        root.locator('.wb-inspector .wb-inspection'),
      ).not.toContainText(options.requests[start].runId);
      expect(count()).toBe(1);
      await tab('Server');
      await hold();
      mark('refreshed');
      await button('Load server thread').click();
      await expect(send).toBeEnabled();
      const restored = await messages();
      expect(restored.map(({ role, content }) => ({ role, content }))).toEqual(
        firstSaved.snapshot?.messages,
      );
      expect(count()).toBe(1);
      expect((await state()).threadId).toBe(loaded.threadId);
      await expect(button('Save server text')).toBeDisabled();
      await hold();
      mark('restored');
      await button('Follow-up').click();
      await send.click();
      await complete();
      expect((await messages()).at(-1)?.content).toContain('Lighthouse');
      const followup = options.requests.at(-1);
      expect(followup?.threadId).toBe(options.requests[start].threadId);
      expect(followup?.runId).not.toBe(options.requests[start].runId);
      expect(
        followup?.messages.filter((message) => message.role === 'user'),
      ).toHaveLength(2);
      expect(
        followup?.messages.find((message) => message.role === 'assistant')
          ?.content,
      ).toBe(original[1].content);
      await tab('Server');
      await hold();
      mark('secondComplete');
      await button('Save from another client').click();
      await expect
        .poll(async () =>
          (await state()).operations.some(
            (operation) =>
              operation.action === 'competing-client-save' &&
              operation.status === 200,
          ),
        )
        .toBe(true);
      expect((await state()).version).toBe(1);
      await hold();
      mark('competing');
      const unsaved = await messages();
      await tab('Server');
      await button('Save server text').click();
      await expect
        .poll(async () => (await state()).operations.at(-1)?.status)
        .toBe(409);
      expect((await state()).version).toBe(1);
      expect(await messages()).toEqual(unsaved);
      await tab('Server');
      await hold();
      mark('conflict');
      await button('Load server thread').click();
      await expect.poll(async () => (await state()).version).toBe(2);
      expect(
        (await messages()).map(({ role, content }) => ({ role, content })),
      ).toEqual(firstSaved.snapshot?.messages);
      await expect(button('Save server text')).toBeDisabled();
      await tab('Server');
      await hold();
      mark('recovered');
    } else {
      await button('Try foreign thread').click();
      await expect
        .poll(async () => (await state()).operations.at(-1)?.status)
        .toBe(404);
      expect(await messages()).toEqual(original);
      expect(count()).toBe(1);
      await tab('Access');
      await hold();
      mark('foreign');
      // This alias supports the common poster timing without inventing another turn.
      mark('secondComplete');
    }
    const expectedCount = lesson === 'server-threads' ? 2 : 1;
    expect(count()).toBe(expectedCount);
    for (const request of options.requests.slice(start)) {
      expect(request.tools).toHaveLength(0);
      expect(request.messages.some((message) => message.role === 'tool')).toBe(
        false,
      );
    }
    const beforeReplay = {
      http,
      count: count(),
      state: await state(),
      messages: await messages(),
    };
    await tab(lesson === 'server-threads' ? 'Server' : 'Access');
    await hold();
    mark('replay');
    await button('Play').click();
    await expect(send).toBeDisabled();
    await hold();
    if (await button('Pause').count()) await button('Pause').click();
    const slider = root.getByRole('slider', { name: 'Seek captured event' });
    await slider.fill('0');
    for (const name of [
      'Start local session',
      'End local session',
      'Load server thread',
      'Save server text',
      'Save from another client',
      'Try anonymous request',
      'Try foreign thread',
    ]) {
      await expect(button(name)).toBeDisabled();
      await button(name).dispatchEvent('click');
    }
    await hold();
    await button('Return to live').click();
    await hold();
    mark('returnedLive');
    expect(http).toBe(beforeReplay.http);
    expect(count()).toBe(beforeReplay.count);
    expect(await messages()).toEqual(beforeReplay.messages);
    expect(await state()).toEqual(beforeReplay.state);
    await tab(lesson === 'server-threads' ? 'Server' : 'Access');
    await hold();
    await page.screenshot({
      path: resolve(work, `${base}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    if (!recording) {
      await root
        .getByLabel('Server thread', { exact: true })
        .selectOption('Harbor');
      await expect(send).toBeDisabled();
      await button('Load server thread').click();
      await expect(send).toBeEnabled();
      expect(await messages()).toEqual([]);
      expect((await state()).threadId).not.toBe(loaded.threadId);
      expect(count()).toBe(expectedCount);
      await button('End local session').click();
      await expect(send).toBeDisabled();
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
      requests: expectedCount,
      replayRequests: 0,
      replayWrites: 0,
      hardReload: lesson === 'server-threads',
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
          http,
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
    const video = page.video();
    await page.close();
    if (video)
      await video.saveAs(
        resolve(work, `${base}${succeeded ? '' : '-failed'}.webm`),
      );
  }
}
