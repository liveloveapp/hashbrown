import type { RunAgentInput } from '@ag-ui/core';
import { type Browser, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Exercises actual SDK workflow clients and their synchronized read-only captures. */
export async function verifyWorkflowWorkbench(options: {
  readonly browser: Browser;
  readonly framework: string;
  readonly lesson: 'shared-state' | 'activities' | 'interrupts';
  readonly origin: string;
  readonly work: string;
  readonly live: boolean;
  readonly recording: boolean;
  readonly requests: readonly RunAgentInput[];
  readonly providerRequests: readonly RunAgentInput[];
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
  const hold = async (milliseconds = 800) => {
    if (recording) await page.waitForTimeout(milliseconds);
  };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let httpRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/workbench/'))
      httpRequests++;
  });
  const start = options.requests.length;
  const providerStart = options.providerRequests.length;
  const count = () => options.requests.length - start;
  let succeeded = false;
  try {
    await page.goto(`${options.origin}/${framework}.html?lesson=${lesson}`);
    const root = page.locator('.wb:visible');
    const send = root.locator('[data-send]');
    const status = root.locator('.wb-chat .wb-panel-head');
    const state = root.locator('.wb-workflow-state');
    const approvals = root.locator('.wb-workflow-approvals');
    const activities = root.locator('.wb-workflow-activity');
    const inspection = root.locator('.wb-inspector .wb-inspection');
    const tab = async (name: string) => {
      await root.getByRole('tab', { name, exact: true }).click();
    };
    const complete = async () => {
      await expect(status).toContainText('complete', { timeout: 90_000 });
    };
    const paused = async () => {
      await expect(status).toContainText('paused', { timeout: 90_000 });
      await expect(approvals).toBeVisible();
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
    const answer = async (value = 'approve') => {
      await root.getByLabel('Approval 1', { exact: true }).selectOption(value);
      await expect(
        root.getByRole('button', { name: 'Submit answers', exact: true }),
      ).toBeDisabled();
      await root
        .getByLabel('Approval 2', { exact: true })
        .selectOption('approve');
      await expect(
        root.getByRole('button', { name: 'Submit answers', exact: true }),
      ).toBeEnabled();
    };
    await expect(send).toBeEnabled();
    await expect(root.locator('.wb-inspector')).toBeVisible();
    await expect(root.locator('.wb-detail')).toBeVisible();
    await expect(
      root.getByRole('button', { name: 'Accept plan', exact: true }),
    ).toHaveCount(0);
    await page.waitForTimeout(100);
    expect(count()).toBe(0);
    expect(httpRequests).toBe(0);
    if (lesson === 'shared-state') {
      await root
        .getByLabel('Plan title', { exact: true })
        .fill('Show how trusted UI works');
      expect(count()).toBe(0);
      await root
        .getByRole('button', { name: 'Set shared state', exact: true })
        .click();
      await expect(state).toContainText('SDK state: Show how trusted UI works');
      expect(count()).toBe(0);
      expect(httpRequests).toBe(0);
    }
    await hold();
    mark('firstRequest');
    await send.click();
    await expect(
      root.getByRole('button', { name: 'Set shared state', exact: true }),
    ).toBeDisabled();
    if (lesson === 'interrupts') {
      await paused();
      mark('paused');
      mark('firstComplete');
      await expect(send).toBeDisabled();
      const originalBatch = await approvals.getAttribute('data-batch-id');
      await expect(
        root.getByRole('button', { name: 'Submit answers', exact: true }),
      ).toBeDisabled();
      await hold();
      await answer();
      await hold();
      mark('resume');
      await root
        .getByRole('button', { name: 'Submit answers', exact: true })
        .click();
      await complete();
      mark('resumedComplete');
      await expect(approvals).toHaveCount(0);
      const initialAndResume = options.requests.slice(start);
      expect(initialAndResume).toHaveLength(2);
      expect(initialAndResume[1].resume).toHaveLength(2);
      expect(JSON.stringify(initialAndResume[1])).not.toContain(originalBatch);
      expect(
        initialAndResume[1].messages.filter(
          (message) => message.role === 'user',
        ),
      ).toHaveLength(1);
      await hold();
    } else {
      if (lesson === 'activities') {
        await expect(activities).toHaveCount(1, { timeout: 60_000 });
        if (!live) await expect(activities).toContainText('context-checked');
      }
      await complete();
      mark('firstComplete');
      await expect(state).toContainText('Committed SDK state');
      if (lesson === 'activities') {
        await expect(activities).toHaveCount(1);
        await expect(activities).toContainText('reply-complete');
        await expect(activities).toContainText('runId');
      }
      await hold();
    }
    await expect(root.locator('[data-source]')).toHaveText(
      live ? 'Live model' : 'Test fixture',
    );
    const firstActivity =
      lesson === 'activities'
        ? await activities.first().getAttribute('data-activity-id')
        : null;
    const firstBatch =
      lesson === 'interrupts'
        ? options.requests[start + 1].resume?.map((entry) => entry.interruptId)
        : [];
    await root.getByRole('button', { name: 'Follow-up', exact: true }).click();
    mark('followup');
    await send.click();
    if (lesson === 'interrupts') {
      await paused();
      const freshBatch = await approvals.getAttribute('data-batch-id');
      expect(freshBatch).toBeTruthy();
      await expect(root.getByLabel('Approval 1', { exact: true })).toHaveValue(
        '',
      );
      await expect(root.getByLabel('Approval 2', { exact: true })).toHaveValue(
        '',
      );
      await tab('Interrupts');
      const body = await inspection.innerText();
      for (const id of firstBatch ?? []) expect(body).not.toContain(id);
    } else {
      await complete();
      await expect(state).toContainText('Committed SDK state');
      if (lesson === 'activities') {
        await expect(activities).toHaveCount(2);
        expect(
          await activities.last().getAttribute('data-activity-id'),
        ).not.toBe(firstActivity);
        await expect(activities.last()).toContainText('reply-complete');
      }
    }
    mark('secondComplete');
    await hold();
    const captured = options.requests.slice(start);
    expect(captured).toHaveLength(lesson === 'interrupts' ? 3 : 2);
    for (const request of captured) {
      expect(request.tools).toHaveLength(0);
      expect(request.threadId).toBe(captured[0].threadId);
      expect(
        (
          request.forwardedProps as {
            hashbrown: { ui: boolean; responseSchema?: unknown };
          }
        ).hashbrown,
      ).toEqual({ ui: false });
    }
    expect(
      captured.at(-1)?.messages.filter((message) => message.role === 'user'),
    ).toHaveLength(2);
    expect(captured.at(-1)?.state).toEqual({
      planTitle:
        lesson === 'shared-state'
          ? 'Show how trusted UI works'
          : captured[0].state &&
            (captured[0].state as { planTitle: string }).planTitle,
      status: 'ready',
    });
    const capturedProviderRequests =
      options.providerRequests.length - providerStart;
    expect(capturedProviderRequests).toBe(captured.length);
    const beforeReplay = count();
    const beforeHTTP = httpRequests;
    mark('replay');
    await root.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(send).toBeDisabled();
    await hold(1500);
    const pause = root.getByRole('button', { name: 'Pause', exact: true });
    if (await pause.count()) await pause.click();
    await root
      .getByRole('button', {
        name:
          lesson === 'interrupts' ? /^Paused for decisions[.]/ : /^Complete[.]/,
      })
      .first()
      .click();
    await expect(
      root.getByRole('button', { name: 'Set shared state', exact: true }),
    ).toBeDisabled();
    if (lesson === 'interrupts') {
      await expect(approvals).toBeVisible();
      await expect(
        root.getByRole('button', { name: 'Submit answers', exact: true }),
      ).toBeDisabled();
      await expect(
        root.getByLabel('Approval 1', { exact: true }),
      ).toBeDisabled();
      await expect(root.getByLabel('Approval 1', { exact: true })).toHaveValue(
        '',
      );
    } else await expect(state).toContainText('Committed SDK state');
    await hold();
    await root.getByRole('slider', { name: 'Seek captured event' }).fill('0');
    await expect(root.locator('.wb-workflow-reply')).toHaveCount(0);
    await expect(activities).toHaveCount(0);
    await expect(approvals).toHaveCount(0);
    await root
      .getByRole('button', { name: 'Return to live', exact: true })
      .click();
    expect(count()).toBe(beforeReplay);
    expect(httpRequests).toBe(beforeHTTP);
    const replayRequests = httpRequests - beforeHTTP;
    mark('returnedLive');
    await tab(
      lesson === 'activities'
        ? 'Activities'
        : lesson === 'interrupts'
          ? 'Interrupts'
          : 'State',
    );
    await hold();
    await page.screenshot({
      path: resolve(work, `${base}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    if (!recording) {
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(state).toBeVisible();
      if (lesson === 'interrupts') await expect(approvals).toBeVisible();
      await page.setViewportSize({ width: 1600, height: 1000 });
    }
    if (!live) {
      // Failed model completions cannot commit ready state or invent a pending approval.
      for (const failed of ['error', 'length'] as const) {
        await newConversation();
        options.outcome(failed);
        await send.click();
        await expect(status).toContainText('error', { timeout: 30_000 });
        await expect(root.getByRole('alert').first()).toBeVisible();
        await expect(state).toContainText('· idle');
        await expect(approvals).toHaveCount(0);
      }
      options.outcome('success');
      await newConversation();
      await send.click();
      const stop = root.getByRole('button', { name: 'Stop', exact: true });
      await expect(stop).toBeEnabled();
      await page.waitForTimeout(150);
      await stop.click();
      await expect(status).toContainText('cancelled');
      await expect(state).toContainText('· idle');
      await expect(approvals).toHaveCount(0);
      if (lesson === 'interrupts') {
        for (const cancel of [false, true]) {
          await newConversation();
          await send.click();
          await paused();
          const before = count();
          const beforeProvider = options.providerRequests.length;
          if (cancel)
            await root
              .getByRole('button', { name: 'Cancel approvals', exact: true })
              .click();
          else {
            await answer('decline');
            await root
              .getByRole('button', { name: 'Submit answers', exact: true })
              .click();
          }
          await complete();
          expect(count()).toBe(before + 1);
          expect(options.providerRequests.length).toBe(beforeProvider);
          const resumed = options.requests.at(-1);
          expect(resumed?.resume).toHaveLength(2);
          if (cancel)
            expect(
              resumed?.resume?.every(
                (entry) =>
                  entry.status === 'cancelled' && entry.payload === undefined,
              ),
            ).toBe(true);
          else
            expect(resumed?.resume?.[0].payload).toEqual({ approved: false });
          await expect(approvals).toHaveCount(0);
        }
        // A transport error before RUN_STARTED releases the local claim for retry.
        await newConversation();
        await send.click();
        await paused();
        await answer();
        await page.route(
          '**/api/workbench/**',
          (route) =>
            route.fulfill({
              status: 503,
              contentType: 'application/json',
              body: JSON.stringify({
                error: 'Intentional pre-ack fixture failure',
              }),
            }),
          { times: 1 },
        );
        await root
          .getByRole('button', { name: 'Submit answers', exact: true })
          .click();
        await expect(root.getByRole('alert').first()).toBeVisible();
        await expect(
          root.getByRole('button', { name: 'Submit answers', exact: true }),
        ).toBeEnabled();
        await root
          .getByRole('button', { name: 'Submit answers', exact: true })
          .click();
        await complete();
        // After RUN_STARTED an unsuccessful continuation requires a new thread.
        await newConversation();
        await send.click();
        await paused();
        await answer();
        options.outcome('error');
        await root
          .getByRole('button', { name: 'Submit answers', exact: true })
          .click();
        await expect(
          root
            .getByRole('alert')
            .filter({ hasText: 'Start a new conversation' }),
        ).toBeVisible({ timeout: 30_000 });
        await expect(send).toBeDisabled();
        options.outcome('success');
      }
      await newConversation();
      const beforeHistory = count();
      await root
        .getByRole('button', { name: 'Two-step plan', exact: true })
        .click();
      expect(count()).toBe(beforeHistory);
      await expect(root.locator('.wb-workflow-reply').first()).toBeVisible();
      const beforeNavigation = count();
      await root.locator('.wb-lessons a[href$="lesson=tools"]').click();
      await expect(page.locator('.wb:visible [data-send]')).toBeEnabled();
      expect(count()).toBe(beforeNavigation);
    }
    expect(errors).toEqual([]);
    succeeded = true;
    return {
      framework,
      lesson,
      phases,
      source: live ? 'provider' : 'test-fixture',
      provider: 'openai',
      agent: 'checked local AG-UI workflow agent',
      requests: captured.length,
      providerRequests: capturedProviderRequests,
      replayRequests,
      passed: true,
    };
  } catch (error) {
    writeFileSync(
      resolve(work, `${base}-failure.json`),
      JSON.stringify(
        {
          framework,
          lesson,
          phases,
          requests: count(),
          httpRequests,
          errors,
          error: String(error),
          publicUI: await page.locator('body').innerText(),
        },
        null,
        2,
      ),
    );
    await page.screenshot({
      path: resolve(work, `${base}-failure.png`),
      fullPage: true,
      animations: 'disabled',
    });
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
