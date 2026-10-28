import {
  expectNoHorizontalOverflow,
  expectWorkbenchDefaultLayout,
} from './verify-workbench-layout';
import type { RunAgentInput } from '@ag-ui/core';
import { type Browser, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  workbenchBrowserInstructions,
  workbenchInstructionsSystem,
  type WorkbenchInstructionsTrace,
  workbenchOnboardingPrompts,
} from '../../examples/quickstart/runtime/workbench-onboarding';

type OnboardingLesson = 'first-plan' | 'conversation' | 'system-instructions';

/** Checks actual onboarding clients, retained request history and inert captured replay. */
export async function verifyOnboardingWorkbench(options: {
  readonly browser: Browser;
  readonly framework: string;
  readonly lesson: OnboardingLesson;
  readonly origin: string;
  readonly work: string;
  readonly live: boolean;
  readonly recording: boolean;
  readonly preview: () => () => void;
  readonly requests: readonly RunAgentInput[];
  readonly instructions: readonly WorkbenchInstructionsTrace[];
  readonly nativeRequests: readonly Record<string, unknown>[];
  readonly outcome: (value: 'success' | 'error' | 'length') => void;
}) {
  const { framework, lesson, live, recording, work } = options;
  console.log(
    `Verifying ${framework}/${lesson} (${live ? 'provider' : 'test-fixture'})`,
  );
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
    if (recording) await page.waitForTimeout(800);
  };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let httpRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/workbench/'))
      httpRequests++;
  });
  const start = options.requests.length;
  const traceStart = options.instructions.length;
  const nativeStart = options.nativeRequests.length;
  const count = () => options.requests.length - start;
  let succeeded = false;
  try {
    await page.goto(`${options.origin}/${framework}.html?lesson=${lesson}`);
    const root = page.locator('.wb:visible');
    const send = root.locator('[data-send]');
    await expect(send).toBeEnabled();
    await expectWorkbenchDefaultLayout(page);
    const inspection = root.locator('.wb-inspector .wb-inspection');
    const status = root.locator('.wb-chat .wb-panel-head');
    const cards = root.getByRole('article', {
      name: 'Summary card',
      exact: true,
    });
    const replies = root.getByRole('article', {
      name: 'Plain text response',
      exact: true,
    });
    const tab = async (name: string) => {
      await root.getByRole('tab', { name, exact: true }).click();
    };
    const revision = async () => {
      await tab('State');
      await expect(inspection).toContainText('"revision": 0');
    };
    const complete = async () => {
      await expect(status).toContainText('complete', { timeout: 90_000 });
    };
    const newConversation = async () => {
      const selected = root.locator('.wb-nav [aria-pressed=true]');
      const previous = await selected.innerText();
      await root
        .getByRole('button', { name: 'New conversation', exact: true })
        .click();
      await expect(selected).not.toHaveText(previous);
      await expect(send).toBeEnabled();
    };
    const instructionsEvidence = async (turn: number) => {
      await tab('Instructions');
      const observed = JSON.parse(
        await inspection.locator('pre').innerText(),
      ) as {
        browser: { policy: string };
        effective: WorkbenchInstructionsTrace;
      };
      expect(observed.browser.policy).toBe(workbenchBrowserInstructions);
      expect(observed.effective).toEqual({
        origin: 'OpenAI adapter mapping',
        policy: workbenchInstructionsSystem,
      });
      expect(options.instructions.slice(traceStart)).toHaveLength(turn);
      expect(options.instructions[traceStart + turn - 1]).toEqual(
        observed.effective,
      );
      if (!live) {
        const native = options.nativeRequests[nativeStart + turn - 1];
        expect(native).toBeDefined();
        expect(native['input']).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
              content: workbenchInstructionsSystem,
            }),
          ]),
        );
        expect(JSON.stringify(native['input'])).not.toContain(
          workbenchBrowserInstructions,
        );
      }
    };
    await expect(send).toBeEnabled();
    await page.waitForTimeout(100);
    expect(count()).toBe(0);
    expect(httpRequests).toBe(0);
    await expect(
      root.getByRole('tab', { name: 'Markdown', exact: true }),
    ).toHaveCount(0);
    await expect(
      root.getByRole('button', { name: 'Accept plan', exact: true }),
    ).toHaveCount(0);
    await revision();
    await tab(
      lesson === 'first-plan'
        ? 'UI'
        : lesson === 'conversation'
          ? 'Requests'
          : 'Instructions',
    );
    await hold();
    mark('firstRequest');
    await send.click();
    let partialTitle = '';
    let partialSteps: string[] = [];
    if (lesson === 'first-plan') {
      await expect(cards.first()).toBeVisible({ timeout: 60_000 });
      // Observe the real streamed component while the SDK is still loading.
      await expect
        .poll(
          async () => {
            const title = await cards.first().locator('h2').innerText();
            if (
              title &&
              title !== 'Building your plan…' &&
              (await status.innerText()).includes('loading')
            ) {
              partialTitle = title;
              partialSteps = await cards
                .first()
                .locator('li')
                .allTextContents();
              return true;
            }
            return false;
          },
          { timeout: 60_000, intervals: [20, 50] },
        )
        .toBe(true);
    } else {
      await expect(replies.first()).not.toBeEmpty({ timeout: 60_000 });
    }
    await complete();
    mark('firstComplete');
    await expect(root.locator('[data-source]')).toHaveText(
      live ? 'Live model' : 'Test fixture',
    );
    if (lesson === 'first-plan') {
      await expect(cards).toHaveCount(1);
      await expect(cards.first().locator('li')).toHaveCount(2);
      const title = await cards.first().locator('h2').innerText();
      const finalSteps = await cards.first().locator('li').allTextContents();
      const observed = JSON.stringify({
        partialTitle,
        partialSteps,
        title,
        finalSteps,
      });
      expect(title.startsWith(partialTitle), observed).toBe(true);
      expect(
        partialTitle.length < title.length ||
          partialSteps.length < finalSteps.length ||
          partialSteps.some(
            (step, index) => step.length < finalSteps[index].length,
          ),
        observed,
      ).toBe(true);
      await expect(cards.locator('button')).toHaveCount(0);
    } else {
      await expect(replies).toHaveCount(1);
      await expect(
        replies.locator('h1,h2,h3,strong,em,a,hb-magic-text'),
      ).toHaveCount(0);
      if (lesson === 'conversation')
        await expect(replies.first()).toContainText('Lighthouse');
      else await instructionsEvidence(1);
    }
    await revision();
    await tab(
      lesson === 'first-plan'
        ? 'UI'
        : lesson === 'conversation'
          ? 'Requests'
          : 'Instructions',
    );
    await hold();
    if (lesson !== 'first-plan') {
      await root
        .getByRole('button', { name: 'Follow-up', exact: true })
        .click();
      mark('followup');
      await send.click();
      await complete();
      await expect(replies).toHaveCount(2);
      if (lesson === 'conversation')
        await expect(replies.last()).toContainText('Lighthouse');
      else await instructionsEvidence(2);
      mark('secondComplete');
      await hold();
    }
    const captured = options.requests.slice(start);
    expect(captured).toHaveLength(lesson === 'first-plan' ? 1 : 2);
    for (const request of captured) {
      expect(request.tools).toHaveLength(0);
      expect(request.messages.some((message) => message.role === 'tool')).toBe(
        false,
      );
      if (lesson !== 'first-plan') {
        const config = (
          request.forwardedProps as {
            hashbrown: { ui: boolean; responseSchema?: unknown };
          }
        ).hashbrown;
        expect(config.ui).toBe(false);
        expect(config.responseSchema).toBeUndefined();
      }
    }
    if (lesson !== 'first-plan') {
      expect(captured[1].threadId).toBe(captured[0].threadId);
      expect(captured[1].runId).not.toBe(captured[0].runId);
      expect(
        captured[1].messages
          .filter((message) => message.role === 'user')
          .map((message) => message.content),
      ).toEqual([...workbenchOnboardingPrompts[lesson]]);
      const firstAssistant = captured[1].messages.find(
        (message) => message.role === 'assistant',
      );
      expect(String(firstAssistant?.content).length).toBeGreaterThan(0);
      if (lesson === 'conversation')
        expect(firstAssistant?.content).toContain('Lighthouse');
    }
    const beforeReplay = count();
    const beforeHTTP = httpRequests;
    mark('replay');
    await root.getByRole('button', { name: 'Play', exact: true }).click();
    if (lesson === 'first-plan')
      await expect(root.locator('[data-replay]')).toBeVisible();
    await expect(send).toBeDisabled();
    await hold();
    const pause = root.getByRole('button', { name: 'Pause', exact: true });
    if (await pause.count()) await pause.click();
    await root
      .getByRole('button', { name: /^Complete[.]/ })
      .first()
      .press('Enter');
    await expect(
      lesson === 'first-plan'
        ? root.locator('[data-replay] .wb-summary').first()
        : replies.first(),
    ).toBeVisible();
    await expect(root.locator('[data-replay] button:enabled')).toHaveCount(0);
    if (lesson === 'system-instructions') {
      await tab('Instructions');
      await expect(inspection).toContainText('OpenAI adapter mapping');
      const replayed = JSON.parse(
        await inspection.locator('pre').innerText(),
      ) as { effective: WorkbenchInstructionsTrace };
      expect(replayed.effective).toEqual({
        origin: 'OpenAI adapter mapping',
        policy: workbenchInstructionsSystem,
      });
    }
    await revision();
    await hold();
    await root.getByRole('slider', { name: 'Seek captured event' }).fill('0');
    await expect(lesson === 'first-plan' ? cards : replies).toHaveCount(0);
    await root
      .getByRole('button', { name: 'Return to live', exact: true })
      .click();
    await revision();
    expect(count()).toBe(beforeReplay);
    expect(httpRequests).toBe(beforeHTTP);
    const replayRequests = httpRequests - beforeHTTP;
    mark('returnedLive');
    await tab(
      lesson === 'first-plan'
        ? 'UI'
        : lesson === 'conversation'
          ? 'Requests'
          : 'Instructions',
    );
    await hold();
    await page.screenshot({
      path: resolve(work, `${base}.png`),
      fullPage: true,
      animations: 'disabled',
    });

    if (!live) {
      // HTTP failure remains local, then the same SDK conversation can recover.
      await newConversation();
      const beforeFailure = count();
      await page.route(
        '**/api/workbench/**',
        (route) =>
          route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Intentional HTTP fixture failure' }),
          }),
        { times: 1 },
      );
      await send.click();
      await expect(root.getByRole('alert').first()).toBeVisible();
      expect(count()).toBe(beforeFailure);
      await revision();
      await root
        .getByRole('button', { name: 'First prompt', exact: true })
        .click();
      await send.click();
      await complete();
      await revision();
      for (const failed of ['error', 'length'] as const) {
        await newConversation();
        options.outcome(failed);
        await send.click();
        await expect(root.getByRole('alert').first()).toBeVisible({
          timeout: 30_000,
        });
        await expect(status).toContainText('error');
        await revision();
      }
      options.outcome('success');
      await newConversation();
      const releaseCancellation = options.preview();
      const beforeCancellation = count();
      await send.click();
      await expect.poll(count).toBeGreaterThan(beforeCancellation);
      const stop = root.getByRole('button', { name: 'Stop', exact: true });
      await expect(stop).toBeEnabled();
      await stop.click();
      releaseCancellation();
      await expect(status).toContainText('cancelled');
      await revision();
      await root
        .getByRole('button', { name: 'First prompt', exact: true })
        .click();
      await send.click();
      await complete();
      await revision();
      await newConversation();
      await expect(lesson === 'first-plan' ? cards : replies).toHaveCount(0);
      const beforeFresh = count();
      await send.click();
      await complete();
      const fresh = options.requests.at(-1);
      if (!fresh) throw new Error('Missing fresh conversation request');
      expect(fresh.threadId).not.toBe(captured[0].threadId);
      expect(
        fresh.messages.filter((message) => message.role === 'user'),
      ).toHaveLength(1);
      expect(
        fresh.messages.some((message) => message.role === 'assistant'),
      ).toBe(false);
      expect(count()).toBe(beforeFresh + 1);
      await newConversation();
      const beforeHistory = count();
      await root
        .getByRole('button', { name: 'Two-step plan', exact: true })
        .click();
      await expect(lesson === 'first-plan' ? cards : replies).toHaveCount(
        lesson === 'first-plan' ? 1 : 2,
      );
      expect(count()).toBe(beforeHistory);
    }
    if (!recording) {
      await page.setViewportSize({ width: 390, height: 844 });
      await expectNoHorizontalOverflow(page);
    }
    await expect(
      root.getByRole('button', { name: 'Accept plan', exact: true }),
    ).toHaveCount(0);
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
      replayRequests,
      partialTitle,
      partialSteps,
      ...(lesson === 'system-instructions'
        ? {
            instructionTraces: captured.length,
            instructionOrigin: 'OpenAI adapter mapping',
          }
        : {}),
    };
  } catch (error) {
    const captureErrors: string[] = [];
    let publicUI = '';
    try {
      publicUI = await page.locator('body').innerText();
      await page.screenshot({
        path: resolve(work, `${base}-failure.png`),
        fullPage: true,
        animations: 'disabled',
      });
    } catch (captureError) {
      captureErrors.push(String(captureError));
    }
    writeFileSync(
      resolve(work, `${base}-failure.json`),
      JSON.stringify(
        {
          framework,
          lesson,
          source: live ? 'provider' : 'test-fixture',
          provider: 'openai',
          passed: false,
          phases,
          requests: count(),
          httpRequests,
          instructionTraces: options.instructions.slice(traceStart),
          errors,
          error: String(error),
          captureErrors,
          publicUI,
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
