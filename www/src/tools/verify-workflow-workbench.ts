import { readInspectorJson, showInspectorMode } from './verify-inspector-modes';
import { saveWorkbenchCapture } from './workbench-capture-file';
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
  readonly preview: () => () => void;
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
  let releaseActivityPreview: (() => void) | undefined;
  try {
    await page.goto(`${options.origin}/${framework}.html?lesson=${lesson}`);
    const root = page.locator('.wb:visible');
    const send = root.locator('[data-send]');
    const status = root.locator('.wb-chat .wb-panel-head');
    const state = root.locator('.wb-workflow-state');
    const approvals = root.locator('.wb-workflow-approvals');
    const activities = root.locator('.wb-workflow-activity');
    const capturedSection = root.locator('.wb-inspector [data-captured]');
    const caption = capturedSection.locator('.wb-caption');
    const inspection = capturedSection.locator('.wb-inspection');
    const tab = async (name: string) => {
      await root.getByRole('tab', { name, exact: true }).click();
    };
    const pairedWorkflowEvidence = async (
      name: 'State' | 'Activities' | 'Interrupts',
    ) => {
      await tab(name);
      // The State tab merges both sections in its Tree mode, with the
      // application half under `moment`.
      const stateTree =
        name === 'State' ? await readInspectorJson(root, 'tree') : undefined;
      const capturedValue = stateTree
        ? Object.fromEntries(
            Object.entries(stateTree).filter(([key]) => key !== 'moment'),
          )
        : await readInspectorJson(root, 'top');
      const interpreted = stateTree
        ? stateTree['moment']
        : await readInspectorJson(root, 'bottom');
      const headings = {
        State: 'Application form and accepted plan',
        Activities: 'Validated progress and linked messages',
        Interrupts: 'Application approval form and outcome',
      };
      if (name !== 'State')
        await expect(capturedSection.locator('h3')).toContainText(
          headings[name],
        );
      await expect(caption).toContainText('Captured SDK observations');
      expect(interpreted).not.toHaveProperty('sdk');
      if (name === 'State') {
        expect(capturedValue).not.toHaveProperty('messages');
        expect(capturedValue).not.toHaveProperty('applicationForm');
        expect(capturedValue.state.status).toBe('ready');
        expect(interpreted.acceptedApplication.revision).toBe(0);
      } else if (name === 'Activities') {
        expect(interpreted.progress).toEqual(
          capturedValue.map(
            (activity: {
              id: string;
              content: { stage: string; label: string };
              links?: unknown;
              hashbrownLinks?: unknown;
            }) => ({
              id: activity.id,
              stage: activity.content.stage,
              label: activity.content.label,
              links: activity.links ?? activity.hashbrownLinks ?? {},
            }),
          ),
        );
      } else {
        expect(capturedValue).not.toHaveProperty('applicationForm');
        expect(interpreted.batchId).toBe(capturedValue.pending?.id ?? null);
        expect(interpreted.recoveryRequired).toBe(
          capturedValue.recoveryRequired,
        );
        expect(interpreted.applicationForm.answers).toBeDefined();
      }
      return { captured: capturedValue, interpreted };
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
    await expect(root.locator('.wb-detail')).toHaveCount(0);
    await expect(root.getByRole('tablist')).toHaveCount(1);
    await expect(capturedSection).toBeVisible();
    await expect(
      root.getByRole('radiogroup', { name: 'Inspector view', exact: true }),
    ).toBeVisible();
    await expect(root.locator('.wb-inspector [data-detail]')).toHaveCount(0);
    await expect(root).not.toHaveClass(/\bwb-rail\b/);
    await expect(root.locator('.wb-split')).toHaveAttribute(
      'aria-valuenow',
      '44',
    );
    await expect(
      root.locator('.wb-nav-heading[aria-expanded=false]'),
    ).toHaveCount(0);
    await expect(
      root.getByRole('button', { name: 'Play', exact: true }).locator('svg'),
    ).toHaveCount(1);
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
    // Hold the fixture verdict until the browser has observed its initial activity.
    if (!live && lesson === 'activities')
      releaseActivityPreview = options.preview();
    await send.click();
    await expect(
      root.getByRole('button', { name: 'Set shared state', exact: true }),
    ).toBeDisabled();
    if (lesson === 'interrupts') {
      await paused();
      mark('paused');
      mark('firstComplete');
      await expect(send).toBeDisabled();
      const pausedEvidence = await pairedWorkflowEvidence('Interrupts');
      expect(pausedEvidence.interpreted.outcome).toBe('paused');
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
      const resumedEvidence = await pairedWorkflowEvidence('Interrupts');
      expect(resumedEvidence.interpreted.outcome).toBe('complete');
      expect(resumedEvidence.interpreted.batchId).toBeNull();
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
        if (!live) {
          await expect(activities).toContainText('context-checked');
          releaseActivityPreview?.();
          releaseActivityPreview = undefined;
        }
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
    const finalEvidence = await pairedWorkflowEvidence(
      lesson === 'activities'
        ? 'Activities'
        : lesson === 'interrupts'
          ? 'Interrupts'
          : 'State',
    );
    expect(finalEvidence.interpreted.outcome).toBe(
      lesson === 'interrupts' ? 'paused' : 'complete',
    );
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
    const selectedMilestone = root
      .getByRole('button', {
        name:
          lesson === 'interrupts' ? /^Paused for decisions[.]/ : /^Complete[.]/,
      })
      .first();
    const milestoneIndex = await selectedMilestone.getAttribute('data-index');
    if (
      milestoneIndex === null ||
      !/^\d+$/.test(milestoneIndex) ||
      !Number.isSafeInteger(Number(milestoneIndex))
    )
      throw new Error('The replay milestone has no valid captured event index');
    // Dense adjacent ticks can overlap; the public scrubber selects the exact frame.
    const scrubber = root.getByRole('slider', { name: 'Seek captured event' });
    await scrubber.fill(milestoneIndex);
    await expect(scrubber).toHaveValue(milestoneIndex);
    await expect(selectedMilestone).toHaveAttribute('aria-pressed', 'true');
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
    const replayEvidence = await pairedWorkflowEvidence(
      lesson === 'activities'
        ? 'Activities'
        : lesson === 'interrupts'
          ? 'Interrupts'
          : 'State',
    );
    expect(replayEvidence.interpreted.outcome).toBe(
      lesson === 'interrupts' ? 'paused' : 'complete',
    );
    // State has Tree/JSON/Raw only; its Tree holds both old sections.
    const evidenceMode = lesson === 'shared-state' ? 'tree' : 'bottom';
    const interpretedBeforeRaw = JSON.stringify(
      await readInspectorJson(root, evidenceMode),
    );
    await showInspectorMode(root, 'raw');
    await expect(
      root.locator('.wb-inspector [role="radio"][data-mode="raw"]'),
    ).toHaveAttribute('aria-checked', 'true');
    const rawCapture = JSON.parse(await inspection.locator('pre').innerText());
    expect(rawCapture.sdk.messages.length).toBeGreaterThan(0);
    expect(rawCapture.event).toEqual(
      expect.objectContaining({
        kind: expect.any(String),
        source: expect.any(String),
      }),
    );
    if (lesson === 'shared-state') {
      expect(replayEvidence.captured).toEqual({
        state: rawCapture.sdk.state,
        isLoading: rawCapture.sdk.isLoading,
        isResuming: rawCapture.sdk.isResuming,
        finishReason: rawCapture.sdk.finishReason ?? null,
        error: rawCapture.sdk.error ?? null,
        recoveryRequired: rawCapture.sdk.recoveryRequired ?? false,
      });
    } else if (lesson === 'activities') {
      expect(replayEvidence.captured).toEqual(rawCapture.sdk.activities);
    } else {
      expect(replayEvidence.captured).toEqual({
        pending: rawCapture.sdk.pendingInterrupts ?? null,
        isResuming: rawCapture.sdk.isResuming,
        recoveryRequired: rawCapture.sdk.recoveryRequired ?? false,
      });
    }
    expect(JSON.stringify(await readInspectorJson(root, evidenceMode))).toBe(
      interpretedBeforeRaw,
    );
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
    const restoredEvidence = await pairedWorkflowEvidence(
      lesson === 'activities'
        ? 'Activities'
        : lesson === 'interrupts'
          ? 'Interrupts'
          : 'State',
    );
    expect(restoredEvidence).toEqual(finalEvidence);
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
      await expect(capturedSection).toBeVisible();
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
      const beforeCancellation = count();
      const releaseCancellation = options.preview();
      await send.click();
      await expect.poll(count).toBeGreaterThan(beforeCancellation);
      const stop = root.getByRole('button', { name: 'Stop', exact: true });
      await expect(stop).toBeEnabled();
      await stop.click();
      releaseCancellation();
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
            .locator('.wb-chat')
            .getByRole('alert')
            .filter({ hasText: 'Start a new conversation' }),
        ).toBeVisible({ timeout: 30_000 });
        const recoveryEvidence = await pairedWorkflowEvidence('Interrupts');
        expect(recoveryEvidence.captured.recoveryRequired).toBe(true);
        expect(recoveryEvidence.interpreted.recoveryRequired).toBe(true);
        expect(recoveryEvidence.interpreted.outcome).toBe('error');
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
    if (process.env['WORKBENCH_RECORD'] === '1')
      await saveWorkbenchCapture(page, resolve(work, `${base}.capture.json`));
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
    releaseActivityPreview?.();
    options.outcome('success');
    const video = page.video();
    await page.close();
    if (video)
      await video.saveAs(
        resolve(work, `${base}${succeeded ? '' : '-failed'}.webm`),
      );
  }
}
