import type { RunAgentInput } from '@ag-ui/core';
import { type Browser, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { WorkbenchPlan } from '../../examples/quickstart/runtime/workbench';
import type { WorkbenchUiLesson } from '../../examples/quickstart/runtime/workbench-ui-kits';
import {
  expectNoHorizontalOverflow,
  expectWorkbenchDefaultLayout,
} from './verify-workbench-layout';

/** Negative provider-native outcomes used only by the labelled fixture host. */
export type UiFixtureOutcome =
  | 'success'
  | 'unknown'
  | 'multiple'
  | 'malformed'
  | 'truncated'
  | 'length'
  | 'error'
  | 'delay';

/** Checks actual framework kit rendering, guarded acceptance and inert component playback. */
export async function verifyUiWorkbench(options: {
  readonly browser: Browser;
  readonly framework: string;
  readonly lesson: WorkbenchUiLesson;
  readonly origin: string;
  readonly work: string;
  readonly live: boolean;
  readonly recording: boolean;
  readonly requests: readonly RunAgentInput[];
  readonly outcome: (value: UiFixtureOutcome) => void;
}) {
  const { framework, lesson, work, live, recording } = options;
  const page = await options.browser.newPage({
    viewport: { width: 1600, height: 1000 },
    ...(recording
      ? { recordVideo: { dir: work, size: { width: 1600, height: 1000 } } }
      : {}),
  });
  const started = Date.now();
  const phases: Record<string, number> = {};
  const mark = (name: string) => {
    phases[name] = (Date.now() - started) / 1000;
  };
  const hold = async () => {
    if (recording) await page.waitForTimeout(2100);
  };
  const base = `${framework}-${lesson}-${live ? 'live' : 'fixture'}`;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let http = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/workbench/')) http++;
  });
  const start = options.requests.length;
  let succeeded = false;
  const observations: { fallback: boolean; json: string }[] = [];
  try {
    await page.goto(`${options.origin}/${framework}.html?lesson=${lesson}`);
    const root = page.locator('.wb:visible');
    const button = (name: string) =>
      root.getByRole('button', { name, exact: true });
    const tab = async (name: string) => {
      await root.getByRole('tab', { name, exact: true }).click();
    };
    const inspection = async () =>
      JSON.parse(
        await root.locator('.wb-inspector .wb-inspection pre').innerText(),
      );
    const ui = async () => {
      await tab('UI');
      return (await inspection()) as {
        component: string | null;
        props: WorkbenchPlan | null;
        sourceStatus: string;
      };
    };
    const state = async () => {
      await tab('State');
      return (await inspection()) as {
        revision: number;
        plan: WorkbenchPlan | null;
      };
    };
    const send = root.locator('[data-send]');
    const complete = async () => {
      await expect(root.locator('.wb-chat .wb-panel-head')).toContainText(
        'complete',
        { timeout: 90_000 },
      );
      await expect(send).toBeEnabled();
    };
    await expect(send).toBeEnabled();
    expect(http).toBe(0);
    await expectWorkbenchDefaultLayout(page);
    const concepts = button('Concepts');
    if ((await concepts.getAttribute('aria-expanded')) === 'true')
      await concepts.click();
    await tab('Kit');
    const kit = await inspection();
    expect(
      kit.components.map((component: { name: string }) => component.name),
    ).toEqual([
      'SummaryCard',
      lesson === 'ui-kits' ? 'StepsCard' : 'PlanReading',
    ]);
    expect(
      kit.components.every(
        (component: { fallback: boolean }) => component.fallback,
      ),
    ).toBe(true);
    await hold();
    await tab('UI');
    await page.exposeFunction(
      '__uiObservation',
      (value: { fallback: boolean; json: string }) => observations.push(value),
    );
    await page.evaluate(() => {
      const root = document.querySelector('.wb');
      if (!root) return;
      const observer = new MutationObserver(() => {
        const fallback = root.querySelector('[data-kit-fallback]');
        const pre = root.querySelector('.wb-inspector .wb-inspection pre');
        void (
          window as unknown as {
            __uiObservation: (value: {
              fallback: boolean;
              json: string;
            }) => Promise<void>;
          }
        ).__uiObservation({
          fallback: !!fallback && fallback.getBoundingClientRect().width > 0,
          json: pre?.textContent ?? '',
        });
      });
      observer.observe(root, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
    });
    await send.click();
    await complete();
    await expect(root.locator('[data-source]')).toHaveText(
      live ? 'Live model' : 'Test fixture',
    );
    const first = await ui();
    expect(first.component).toBe('SummaryCard');
    expect(first.props?.steps).toHaveLength(2);
    const firstPlan = first.props as WorkbenchPlan;
    const fallbackObserved = observations.some((value) => value.fallback);
    expect(fallbackObserved).toBe(true);
    expect(
      observations.some(({ json }) => {
        try {
          const value = JSON.parse(json);
          return (
            value.sourceStatus === 'loading' &&
            value.component === 'SummaryCard' &&
            value.props?.steps?.length > 0
          );
        } catch {
          return false;
        }
      }),
    ).toBe(true);
    await hold();
    mark('firstComplete');
    await expect(button('Accept plan')).toBeEnabled();
    await button('Accept plan').click();
    await expect.poll(async () => (await state()).revision).toBe(1);
    expect((await state()).plan).toEqual(firstPlan);
    await expect(button('Plan accepted')).toBeDisabled();
    await button('Plan accepted').dispatchEvent('click');
    expect((await state()).revision).toBe(1);
    await tab('Kit');
    await hold();
    mark('firstAccepted');
    await tab('UI');
    await hold();
    mark('followup');
    await button('Follow-up').click();
    await send.click();
    await complete();
    const second = await ui();
    expect(second.component).toBe(
      lesson === 'ui-kits' ? 'StepsCard' : 'PlanReading',
    );
    expect(second.props?.steps).toHaveLength(2);
    expect(second.props?.steps[0]).toBe(firstPlan.steps[0]);
    if (lesson === 'ui-chatbot') {
      expect(second.props).toEqual(firstPlan);
      await expect(button('Accept plan')).toHaveCount(0);
    } else {
      expect(second.props?.steps[1].length).toBeLessThanOrEqual(
        firstPlan.steps[1].length,
      );
      await expect(button('Accept plan')).toBeEnabled();
    }
    const captured = options.requests.slice(start);
    expect(captured).toHaveLength(4);
    expect(new Set(captured.map((request) => request.threadId)).size).toBe(1);
    expect(new Set(captured.map((request) => request.runId)).size).toBe(4);
    expect(
      new Set(
        captured.map(
          (request) =>
            request.messages.filter((message) => message.role === 'user').at(-1)
              ?.id,
        ),
      ).size,
    ).toBe(2);
    const latestTool = captured
      .at(-1)
      ?.messages.filter((message) => message.role === 'tool')
      .at(-1);
    expect(typeof latestTool?.content).toBe('string');
    expect(JSON.parse(latestTool?.content as string)).toMatchObject({
      revision: 1,
      plan: firstPlan,
    });
    await tab('Schema');
    expect(await inspection()).toEqual(
      captured[0].forwardedProps?.['hashbrown']?.['responseSchema'],
    );
    await tab('UI');
    await hold();
    mark('secondComplete');
    if (lesson === 'ui-kits') {
      await button('Accept plan').click();
      await expect.poll(async () => (await state()).revision).toBe(2);
      expect((await state()).plan).toEqual(second.props);
      await tab('UI');
      await hold();
      mark('secondAccepted');
    } else expect((await state()).revision).toBe(1);
    await tab('UI');
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: resolve(work, `${base}.png`),
      fullPage: true,
    });
    const before = {
      http,
      count: options.requests.length,
      state: await state(),
    };
    await tab('UI');
    await hold();
    mark('replay');
    await button('Play').click();
    await expect(send).toBeDisabled();
    await hold();
    if (await button('Pause').count()) await button('Pause').click();
    await root.getByRole('slider', { name: 'Seek captured event' }).fill('0');
    await expect(button('Accept plan')).toHaveCount(0);
    await hold();
    await button('Return to live').click();
    await hold();
    mark('returnedLive');
    // Reserve a readable encoded tail for the final caption before closing the page.
    if (recording) await page.waitForTimeout(750);
    expect(http).toBe(before.http);
    expect(options.requests.length).toBe(before.count);
    expect(await state()).toEqual(before.state);
    await tab('UI');
    if (!live) {
      const fresh = async () => {
        const selected = root.locator('.wb-nav [aria-pressed=true]');
        const previous = await selected.innerText();
        await button('New conversation').click();
        await expect(selected).not.toHaveText(previous);
        await expect(send).toBeEnabled();
      };
      for (const outcome of [
        'unknown',
        'multiple',
        'malformed',
        'truncated',
        'length',
        'error',
      ] as const) {
        options.outcome(outcome);
        await fresh();
        await send.click();
        await expect(send).toBeEnabled({ timeout: 30_000 });
        const accepts = button('Accept plan');
        for (const accept of await accepts.all()) {
          await expect(accept).toBeDisabled();
          await accept.dispatchEvent('click');
        }
        expect((await state()).revision).toBe(0);
        expect((await state()).plan).toBeNull();
        options.outcome('success');
        await button('First prompt').click();
        await send.click();
        await complete();
        expect((await ui()).component).toBe('SummaryCard');
        await expect(button('Accept plan').last()).toBeEnabled();
        expect((await state()).revision).toBe(0);
      }
      options.outcome('delay');
      await fresh();
      const cancelStart = options.requests.length;
      await send.click();
      await expect
        .poll(() => options.requests.length)
        .toBeGreaterThan(cancelStart);
      const cancelledThread = options.requests.at(-1)?.threadId;
      await expect(button('Stop')).toBeEnabled();
      await button('Stop').click();
      await expect(send).toBeEnabled();
      const stoppedCount = options.requests.length;
      await page.waitForTimeout(1000);
      expect(options.requests.length).toBe(stoppedCount);
      expect((await state()).revision).toBe(0);
      options.outcome('success');
      await button('First prompt').click();
      await send.click();
      await complete();
      expect(options.requests.at(-1)?.threadId).toBe(cancelledThread);
      await expect(button('Accept plan').last()).toBeEnabled();
      expect((await state()).revision).toBe(0);

      options.outcome('delay');
      await fresh();
      const navigationStart = options.requests.length;
      await send.click();
      await expect
        .poll(() => options.requests.length)
        .toBeGreaterThan(navigationStart);
      await fresh();
      const navigatedCount = options.requests.length;
      await page.waitForTimeout(1000);
      expect(options.requests.length).toBe(navigatedCount);
      expect(await state()).toEqual({ revision: 0, plan: null });
      await expect(root.locator('[data-ui-component]')).toHaveCount(0);
      options.outcome('success');
      await page.setViewportSize({ width: 390, height: 844 });
      await expectNoHorizontalOverflow(page);
    }
    expect(errors).toEqual([]);
    succeeded = true;
    return {
      framework,
      lesson,
      passed: true,
      source: live ? 'provider' : 'test-fixture',
      provider: 'openai',
      phases,
      requests: captured.length,
      replayRequests: 0,
      replayWrites: 0,
      fallbackObserved,
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
          http,
          errors,
          error: String(error),
          publicUI: await page
            .locator('body')
            .innerText()
            .catch(() => ''),
          observations: observations.slice(-12),
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
