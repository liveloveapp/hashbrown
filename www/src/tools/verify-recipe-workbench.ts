import { saveWorkbenchCapture } from './workbench-capture-file';
import {
  expectNoHorizontalOverflow,
  expectWorkbenchDefaultLayout,
} from './verify-workbench-layout';
import type { RunAgentInput } from '@ag-ui/core';
import type { Decision } from '@hashbrownai/core';
import { workbenchSelectionMinConfidence } from '../../examples/quickstart/runtime/workbench-recipes';
import { type Browser, expect } from '@playwright/test';
import { resolve } from 'node:path';
import {
  expectInspectionText,
  readInspectorJson,
  showInspectorMode,
} from './verify-inspector-modes';
import { writeFileSync } from 'node:fs';

type RecipeLesson = 'magic-text' | 'predictions' | 'ui-selection';
type RecipeOutcome =
  | 'success'
  | 'empty'
  | 'wrong-context'
  | 'unknown'
  | 'duplicate'
  | 'error'
  | 'length'
  | 'schema';

/** Exercises actual recipe SDKs, immutable replay and explicit application writes through the shared host. */
export async function verifyRecipeWorkbench(options: {
  browser: Browser;
  framework: string;
  lesson: RecipeLesson;
  origin: string;
  work: string;
  live: boolean;
  recording: boolean;
  preview: () => () => void;
  requests: readonly RunAgentInput[];
  decisionRequests: readonly Decision.Request[];
  outcome: (value: RecipeOutcome) => void;
  decisionOutcome: (
    value: 'success' | 'low' | 'error' | 'delay' | 'unknown',
  ) => void;
}) {
  const { browser, framework, lesson, origin, work, live, recording } = options;
  console.log(
    `Verifying ${framework}/${lesson} (${live ? 'provider' : 'test-fixture'})`,
  );
  const page = await browser.newPage({
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
    if (recording) await page.waitForTimeout(700);
  };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let httpRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/workbench/'))
      httpRequests++;
  });
  const requestStart = options.requests.length;
  const decisionStart = options.decisionRequests.length;
  const requestCount = () =>
    lesson === 'ui-selection'
      ? options.decisionRequests.length - decisionStart
      : options.requests.length - requestStart;
  const artifactBase = `${framework}-${lesson}-${live ? 'live' : 'fixture'}`;
  let succeeded = false;
  const captureFailure = async () => {
    if (page.isClosed()) return;
    await page.screenshot({
      path: resolve(work, `${artifactBase}-failure.png`),
      fullPage: true,
      animations: 'disabled',
    });
    const sample = await page.evaluate(() => {
      const workbench = [...document.querySelectorAll<HTMLElement>('.wb')].find(
        (element) => element.getClientRects().length > 0,
      );
      const text = (selector: string) =>
        workbench?.querySelector<HTMLElement>(selector)?.innerText ?? '';
      return {
        status: text('.wb-chat .wb-panel-head'),
        source: text('[data-source]'),
        conversationText: text('.wb-chat [data-live]'),
        renderedMarkdown: [
          ...(workbench?.querySelectorAll<HTMLElement>(
            'article[aria-label="Markdown explanation"]',
          ) ?? []),
        ].map((article) => ({
          text: article.innerText,
          html: article.innerHTML,
        })),
        inspector: text('.wb-inspector .wb-inspection'),
        context: text('.wb-inspector [data-captured]'),
      };
    });
    writeFileSync(
      resolve(work, `${artifactBase}-failure.json`),
      JSON.stringify(
        {
          framework,
          lesson,
          source: live ? 'provider' : 'test-fixture',
          phases,
          requests: requestCount(),
          httpRequests,
          sample,
        },
        null,
        2,
      ),
    );
  };
  try {
    await page.goto(`${origin}/${framework}.html?lesson=${lesson}`);
    const root = page.locator('.wb:visible');
    const send = root.locator('[data-send]');
    await expect(send).toBeEnabled();
    await expectWorkbenchDefaultLayout(page);
    const inspection = root.locator('.wb-inspector .wb-inspection');
    const chatStatus = root.locator('.wb-chat .wb-panel-head');
    const tab = async (name: string) => {
      await root
        .getByRole('tablist', { name: 'Inspector views', exact: true })
        .getByRole('tab', { name, exact: true })
        .click();
    };
    const revision = async (value: number) => {
      await tab('State');
      await expectInspectionText(inspection, `"revision": ${value}`);
    };
    const complete = async () => {
      await expect(chatStatus).toContainText('complete', { timeout: 90_000 });
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
    await expect(send).toBeEnabled();
    await page.waitForTimeout(100);
    expect(requestCount()).toBe(0);
    expect(httpRequests).toBe(0);
    await revision(0);
    await tab(lesson === 'magic-text' ? 'Markdown' : 'JSON');
    await hold();
    mark('firstRequest');
    if (
      lesson === 'ui-selection' &&
      !live &&
      process.env['WORKBENCH_SELECTION_FIRST_LOW'] === '1'
    )
      options.decisionOutcome('low');
    const releasePreview =
      !live && lesson !== 'ui-selection' ? options.preview() : undefined;
    await send.click();
    const text = root.getByRole('article', {
      name: 'Markdown explanation',
      exact: true,
    });
    const predictions = root.getByRole('article', {
      name: 'Predictive suggestions',
      exact: true,
    });
    const selections = root.getByRole('article', {
      name: 'UI selection result',
      exact: true,
    });
    if (lesson === 'magic-text') {
      await expect(text.first()).toContainText(/plan/i, { timeout: 60_000 });
      if (!live) await expect(chatStatus).toContainText('loading');
    } else if (lesson === 'predictions' && !live) {
      await tab('JSON');
      await expect
        .poll(
          async () => {
            try {
              const partial = JSON.parse(
                await inspection.locator('pre').innerText(),
              ) as { contextId?: string; suggestions?: unknown[] };
              return (
                typeof partial.contextId === 'string' &&
                Array.isArray(partial.suggestions)
              );
            } catch {
              return false;
            }
          },
          { intervals: [25, 50] },
        )
        .toBe(true);
      await expect(chatStatus).toContainText('loading');
      await expect(root.getByRole('button', { name: /^Accept / })).toHaveCount(
        0,
      );
    }
    releasePreview?.();
    await complete();
    if (lesson === 'ui-selection' && !live) options.decisionOutcome('success');
    await expect(root.locator('[data-source]')).toHaveText(
      live ? 'Live model' : 'Test fixture',
    );
    mark('firstComplete');
    if (process.env['WORKBENCH_DIAGNOSTIC_FIRST_TURN'] === '1')
      throw new Error(
        'First-turn diagnostic captured; no follow-up request was sent.',
      );
    let firstLength = 0;
    let firstConfidence = 0;
    let firstManualChoice = false;
    let secondChoiceConfidence = 0;
    let lowConfidenceSecondChoice = false;
    if (lesson === 'magic-text') {
      await expect(text.first().locator('h1,h2,h3')).toHaveCount(1);
      await expect(text.first().locator('strong,em')).not.toHaveCount(0);
      await expect(text.first().locator('li')).toHaveCount(2);
      firstLength = (await text.first().innerText()).length;
      const citation = text
        .first()
        .locator('a')
        .filter({ hasText: /1/ })
        .first();
      await expect(citation).toBeVisible();
      const url = page.url();
      mark('citation');
      await citation.click();
      await showInspectorMode(root, 'bottom');
      await expect(root.locator('.wb-inspector [data-captured]')).toContainText(
        'https://hashbrown.dev',
      );
      await showInspectorMode(root, 'top');
      expect(page.url()).toBe(url);
      await hold();
      await revision(0);
      mark('accept');
    } else if (lesson === 'predictions') {
      await expect(
        predictions
          .first()
          .getByRole('button', { name: 'Accept Record the demo', exact: true }),
      ).toBeEnabled();
      const dismiss = predictions
        .first()
        .getByRole('button', { name: 'Dismiss Record the demo', exact: true });
      await expect(dismiss).toBeEnabled();
      mark('dismiss');
      await dismiss.click();
      await expect(dismiss).toBeDisabled();
      await revision(0);
      await expect(predictions.first()).toContainText('Dismissed');
      await hold();
      await tab('JSON');
      await root
        .getByRole('button', { name: 'First prompt', exact: true })
        .click();
      mark('retryRequest');
      await send.click();
      await complete();
      await expect(predictions).toHaveCount(2);
      const freshRecord = predictions
        .nth(1)
        .getByRole('button', { name: 'Accept Record the demo', exact: true });
      await expect(freshRecord).toBeEnabled();
      mark('retryComplete');
      await revision(0);
      await expect(dismiss).toBeDisabled();
      await hold();
      mark('accept');
      await freshRecord.click();
      await revision(1);
      await expectInspectionText(inspection, '"nextAction": "record"');
      await expect(predictions.nth(1).locator('button:enabled')).toHaveCount(0);
      await expect(predictions.first().locator('button:enabled')).toHaveCount(
        0,
      );
      await expect(
        predictions.first().getByText('Accepted', { exact: true }),
      ).toHaveCount(0);
      await expect(predictions.first()).toContainText('Dismissed');
      await expect(
        predictions.nth(1).getByText('Accepted', { exact: true }),
      ).toHaveCount(1);
    } else {
      await tab('JSON');
      const raw = JSON.parse(await inspection.locator('pre').innerText()) as {
        value: { pick: string };
        meta: { pick: { confidence: number } };
      };
      expect(['summary', 'steps']).toContain(raw.value.pick);
      firstConfidence = raw.meta.pick.confidence;
      expect(Number.isFinite(firstConfidence)).toBe(true);
      expect(firstConfidence).toBeGreaterThanOrEqual(0);
      expect(firstConfidence).toBeLessThanOrEqual(1);
      firstManualChoice = firstConfidence < workbenchSelectionMinConfidence;
      const summaryPreview = selections
        .first()
        .getByRole('article', { name: 'Plan summary', exact: true });
      const useView = selections
        .first()
        .getByRole('button', { name: 'Use view', exact: true });
      const detail = (await readInspectorJson(root, 'bottom')) as {
        selected: string[];
        confidence: number;
      };
      await showInspectorMode(root, 'top');
      expect(detail.confidence).toBe(firstConfidence);
      expect(detail.selected).toEqual(firstManualChoice ? [] : ['summary']);
      if (firstManualChoice) {
        await expect(summaryPreview).toHaveCount(0);
        await expect(useView).toBeDisabled();
        await expect(selections.first()).toContainText(
          'Low confidence. Choose a view manually.',
        );
      } else {
        expect(raw.value.pick).toBe('summary');
        await expect(summaryPreview).toBeVisible();
        await expect(useView).toBeEnabled();
      }
      await expect(selections.first()).toContainText('Confidence:');
      await revision(0);
      await hold();
      mark('accept');
      if (firstManualChoice)
        await root
          .getByRole('button', { name: 'Show summary', exact: true })
          .click();
      else await useView.click();
      await revision(1);
      await expectInspectionText(inspection, '"selectedView": "summary"');
    }
    await hold();
    await tab(lesson === 'magic-text' ? 'Markdown' : 'JSON');
    await root.getByRole('button', { name: 'Follow-up', exact: true }).click();
    mark('followup');
    if (
      lesson === 'ui-selection' &&
      !live &&
      process.env['WORKBENCH_SELECTION_SECOND_LOW'] === '1'
    )
      options.decisionOutcome('low');
    await send.click();
    await complete();
    if (lesson === 'ui-selection' && !live) options.decisionOutcome('success');
    if (lesson === 'magic-text') {
      await expect(text).toHaveCount(2);
      expect((await text.last().innerText()).length).toBeLessThan(firstLength);
      await expect(
        text.last().locator('a').filter({ hasText: /1/ }),
      ).not.toHaveCount(0);
      await revision(0);
    } else if (lesson === 'predictions') {
      await expect(predictions).toHaveCount(3);
      await expect(
        predictions
          .last()
          .getByRole('button', { name: 'Accept Review the demo', exact: true }),
      ).toBeEnabled();
      await expect(
        predictions
          .last()
          .getByRole('button', { name: 'Accept Record the demo', exact: true }),
      ).toHaveCount(0);
      await revision(1);
    } else {
      await expect(selections).toHaveCount(2);
      await tab('JSON');
      const raw = JSON.parse(await inspection.locator('pre').innerText()) as {
        value: { pick: string };
        meta: { pick: { confidence: number } };
      };
      expect(['summary', 'steps']).toContain(raw.value.pick);
      secondChoiceConfidence = raw.meta.pick.confidence;
      expect(Number.isFinite(secondChoiceConfidence)).toBe(true);
      expect(secondChoiceConfidence).toBeGreaterThanOrEqual(0);
      expect(secondChoiceConfidence).toBeLessThanOrEqual(1);
      lowConfidenceSecondChoice =
        secondChoiceConfidence < workbenchSelectionMinConfidence;
      const preview = selections
        .last()
        .getByRole('article', { name: 'Plan steps', exact: true });
      const useView = selections
        .last()
        .getByRole('button', { name: 'Use view', exact: true });
      const detail = (await readInspectorJson(root, 'bottom')) as {
        selected: string[];
        confidence: number;
      };
      await showInspectorMode(root, 'top');
      expect(detail.confidence).toBe(secondChoiceConfidence);
      expect(detail.selected).toEqual(
        lowConfidenceSecondChoice ? [] : ['steps'],
      );
      if (lowConfidenceSecondChoice) {
        await expect(preview).toHaveCount(0);
        await expect(useView).toBeDisabled();
        await expect(selections.last()).toContainText(
          'Low confidence. Choose a view manually.',
        );
      } else {
        expect(raw.value.pick).toBe('steps');
        await expect(preview).toBeVisible();
        await expect(useView).toBeEnabled();
      }
      await revision(1);
      await expectInspectionText(inspection, '"selectedView": "summary"');
    }
    mark('secondComplete');
    if (lesson === 'predictions') mark('followupComplete');
    const captured = options.requests.slice(requestStart);
    const decisions = options.decisionRequests.slice(decisionStart);
    expect(requestCount()).toBe(
      lesson === 'magic-text' ? 4 : lesson === 'predictions' ? 3 : 2,
    );
    if (lesson === 'magic-text') {
      expect(new Set(captured.map((request) => request.threadId)).size).toBe(1);
      expect(
        captured.at(-1)?.messages.filter((message) => message.role === 'user'),
      ).toHaveLength(2);
      expect(
        captured.filter((request) => request.messages.at(-1)?.role === 'tool'),
      ).toHaveLength(2);
    } else if (lesson === 'predictions') {
      const inputs = captured.map((request) => {
        const users = request.messages.filter(
          (message) => message.role === 'user',
        );
        expect(users).toHaveLength(1);
        expect(request.tools).toHaveLength(0);
        return JSON.parse(String(users[0].content)) as {
          contextId: string;
          application: { revision: number; acceptedActions: string[] };
        };
      });
      expect(new Set(inputs.map((input) => input.contextId)).size).toBe(3);
      expect(inputs[0].application).toMatchObject({
        revision: 0,
        acceptedActions: [],
      });
      expect(inputs[1].application).toEqual(inputs[0].application);
      expect(inputs[2].application).toMatchObject({
        revision: 1,
        acceptedActions: ['record'],
      });
    } else {
      expect(
        (
          decisions[1].state as {
            input: { application: { revision: number; selectedView: string } };
          }
        ).input.application,
      ).toMatchObject({ revision: 1, selectedView: 'summary' });
    }
    await hold();
    if (lesson === 'ui-selection') {
      const beforeManual = requestCount();
      const beforeManualHTTP = httpRequests;
      mark('manual');
      await root
        .getByRole('button', { name: 'Show steps', exact: true })
        .click();
      await revision(2);
      await expectInspectionText(inspection, '"selectedView": "steps"');
      await expect(
        root.getByRole('article', { name: 'Plan steps', exact: true }).last(),
      ).toBeVisible();
      expect(requestCount()).toBe(beforeManual);
      expect(httpRequests).toBe(beforeManualHTTP);
      await hold();
    }
    const beforeReplay = requestCount();
    const beforeReplayHTTP = httpRequests;
    mark('replay');
    await root.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(send).toBeDisabled();
    await hold();
    const pause = root.getByRole('button', { name: 'Pause', exact: true });
    if (await pause.count()) await pause.click();
    await root
      .getByRole('button', {
        name:
          lesson === 'magic-text'
            ? /^Parsed text[.]/
            : lesson === 'predictions'
              ? /^Suggestions ready[.]/
              : /^Selection result[.]/,
      })
      .first()
      .press('Enter');
    if (lesson === 'magic-text') {
      await expect(text.first()).toBeVisible();
      const seek = root.getByRole('slider', { name: 'Seek captured event' });
      // Inspect a complete captured reference, then seek an actual partial SDK render.
      await root
        .getByRole('button', { name: /^Complete[.]/ })
        .first()
        .press('Enter');
      const historicalCitation = text
        .first()
        .locator('a[role="doc-noteref"]')
        .first();
      await expect(historicalCitation).toBeVisible();
      const maximum = await seek.getAttribute('max');
      await historicalCitation.click();
      await expect(seek).toHaveAttribute('max', maximum ?? '');
      await root
        .getByRole('button', { name: /^Streaming text[.]/ })
        .first()
        .press('Enter');
      await expect(chatStatus).toContainText('loading');
      let index = Number(await seek.inputValue());
      for (let attempts = 0; attempts < 12; attempts++) {
        await page.waitForTimeout(50);
        const length = (await text.count())
          ? (await text.first().innerText()).trim().length
          : 0;
        if (length > 0 && length < firstLength) break;
        await seek.fill(String(++index));
      }
      await expect(text.first()).toBeVisible();
      const partialLength = (await text.first().innerText()).length;
      expect(partialLength).toBeGreaterThan(0);
      expect(partialLength).toBeLessThan(firstLength);
      await expect(chatStatus).toContainText('loading');
      await expect(root.locator('[data-source]')).toHaveText(
        live ? 'Live model' : 'Test fixture',
      );
    } else {
      await expect(root.locator('[data-live] button:enabled')).toHaveCount(0);
      if (lesson === 'predictions') {
        await root
          .getByRole('button', { name: /^Suggestion dismissed[.]/ })
          .first()
          .press('Enter');
        await expect(predictions).toHaveCount(1);
        await expect(predictions.first()).toContainText('Dismissed');
        await expect(
          predictions.first().getByText('Accepted', { exact: true }),
        ).toHaveCount(0);
        await expect(root.locator('[data-live] button:enabled')).toHaveCount(0);
        await expect(root.locator('[data-source]')).toHaveText(
          live ? 'Live model' : 'Test fixture',
        );
      }
      if (lesson === 'ui-selection') {
        await root
          .getByRole('button', { name: /^Selection result[.]/ })
          .last()
          .press('Enter');
        await tab('JSON');
        await showInspectorMode(root, 'bottom');
        await expect(
          root.locator('.wb-inspector [data-captured]'),
        ).toContainText(`"confidence": ${secondChoiceConfidence}`);
        const capturedSelection = (await readInspectorJson(root, 'bottom')) as {
          selected: string[];
          confidence: number;
        };
        await showInspectorMode(root, 'top');
        expect(capturedSelection.selected).toEqual(
          lowConfidenceSecondChoice ? [] : ['steps'],
        );
        await expect(
          selections
            .last()
            .getByRole('article', { name: 'Plan steps', exact: true }),
        ).toHaveCount(lowConfidenceSecondChoice ? 0 : 1);
        await expect(root.locator('[data-live] button:enabled')).toHaveCount(0);
        await revision(1);
        await expectInspectionText(inspection, '"selectedView": "summary"');
        await root
          .getByRole('button', { name: /^Selection result[.]/ })
          .first()
          .press('Enter');
      }
    }
    await revision(0);
    await hold();
    await root.getByRole('slider', { name: 'Seek captured event' }).fill('0');
    await revision(0);
    await root
      .getByRole('button', { name: 'Return to live', exact: true })
      .click();
    await revision(
      lesson === 'magic-text' ? 0 : lesson === 'ui-selection' ? 2 : 1,
    );
    expect(requestCount()).toBe(beforeReplay);
    expect(httpRequests).toBe(beforeReplayHTTP);
    const replayRequests = httpRequests - beforeReplayHTTP;
    mark('returnedLive');
    await tab(
      lesson === 'magic-text'
        ? 'Markdown'
        : lesson === 'ui-selection'
          ? 'UI'
          : 'JSON',
    );
    if (lesson === 'magic-text') {
      const beforeCitation = requestCount();
      await text.last().locator('a[role="doc-noteref"]').first().click();
      await showInspectorMode(root, 'bottom');
      await expect(root.locator('.wb-inspector [data-captured]')).toContainText(
        'https://hashbrown.dev',
      );
      await showInspectorMode(root, 'top');
      expect(requestCount()).toBe(beforeCitation);
      expect(httpRequests).toBe(beforeReplayHTTP);
      await hold();
    }
    await page.screenshot({
      path: resolve(
        work,
        `${framework}-${lesson}-${live ? 'live' : 'fixture'}.png`,
      ),
      fullPage: true,
      animations: 'disabled',
    });
    await hold();

    if (!live) {
      if (lesson === 'ui-selection') {
        await newConversation();
        const manualCount = requestCount();
        await root
          .getByRole('button', { name: 'Show summary', exact: true })
          .click();
        await revision(1);
        await expectInspectionText(inspection, '"selectedView": "summary"');
        expect(requestCount()).toBe(manualCount);
        for (const outcome of ['low', 'error', 'unknown'] as const) {
          await newConversation();
          options.decisionOutcome(outcome);
          await send.click();
          if (outcome === 'low') {
            await complete();
            await expect(selections).toContainText('Low confidence');
            await expect(
              selections.getByRole('button', { name: 'Use view', exact: true }),
            ).toBeDisabled();
          } else await expect(root.getByRole('alert').first()).toBeVisible();
          await revision(0);
          await root
            .getByRole('button', { name: 'Show steps', exact: true })
            .click();
          await revision(1);
          await expectInspectionText(inspection, '"selectedView": "steps"');
        }
        await newConversation();
        options.decisionOutcome('delay');
        const pendingStart = requestCount();
        await send.click();
        await expect.poll(requestCount).toBe(pendingStart + 1);
        await expect(
          root.getByRole('button', { name: 'Stop', exact: true }),
        ).toBeEnabled();
        await root
          .getByRole('button', { name: 'Show steps', exact: true })
          .click();
        await revision(1);
        await page.waitForTimeout(900);
        await expectInspectionText(inspection, '"selectedView": "steps"');
        await expect(selections).toHaveCount(0);
        expect(requestCount()).toBe(pendingStart + 1);
        options.decisionOutcome('success');
      } else {
        if (lesson === 'predictions') {
          await newConversation();
          options.outcome('empty');
          await send.click();
          await complete();
          await expect(predictions).toContainText(
            'No suggestions for this context.',
          );
          await revision(0);
        }
        for (const outcome of (lesson === 'predictions'
          ? [
              'wrong-context',
              'unknown',
              'duplicate',
              'schema',
              'error',
              'length',
            ]
          : ['error', 'length']) as RecipeOutcome[]) {
          await newConversation();
          options.outcome(outcome);
          await send.click();
          await expect(root.getByRole('alert').first()).toBeVisible({
            timeout: 30_000,
          });
          await revision(0);
          await expect(root.locator('[data-live] button:enabled')).toHaveCount(
            0,
          );
          if (lesson === 'magic-text') {
            await tab('Markdown');
            await expect(text.last()).toBeVisible();
            await showInspectorMode(root, 'bottom');
            await expect(
              root.locator('.wb-inspector [data-captured]'),
            ).toContainText('"isComplete": true');
            await expect(
              root.locator('.wb-inspector [data-captured]'),
            ).toContainText('"outcome": "error"');
            await showInspectorMode(root, 'top');
            if (outcome === 'error') {
              options.outcome('success');
              await root
                .getByRole('button', { name: 'Follow-up', exact: true })
                .click();
              await send.click();
              await complete();
              await expect(text).toHaveCount(2);
              await revision(0);
            }
          }
        }
        await newConversation();
        options.outcome('success');
        const releaseCancellation = options.preview();
        const beforeCancellation = requestCount();
        await send.click();
        await expect.poll(requestCount).toBeGreaterThan(beforeCancellation);
        await expect(
          root.getByRole('button', { name: 'Stop', exact: true }),
        ).toBeEnabled();
        await root.getByRole('button', { name: 'Stop', exact: true }).click();
        releaseCancellation();
        await expect(chatStatus).toContainText('cancelled');
        await revision(0);
        await root
          .getByRole('button', { name: 'Follow-up', exact: true })
          .click();
        await send.click();
        await complete();
        await page.waitForTimeout(500);
        await expect(chatStatus).toContainText('complete');
        await revision(0);
      }
    }
    if (!recording) {
      await newConversation();
      const count = requestCount();
      await root
        .getByRole('button', { name: 'Two-step plan', exact: true })
        .click();
      await expect(send).toBeEnabled();
      await expect(
        lesson === 'magic-text'
          ? text
          : lesson === 'predictions'
            ? predictions
            : selections,
      ).toHaveCount(lesson === 'predictions' ? 3 : 2);
      expect(requestCount()).toBe(count);
      await page.setViewportSize({ width: 390, height: 844 });
      await expectNoHorizontalOverflow(page);
    }
    expect(errors).toEqual([]);
    if (process.env['WORKBENCH_RECORD'] === '1')
      await saveWorkbenchCapture(
        page,
        resolve(work, `${artifactBase}.capture.json`),
      );
    succeeded = true;
    return {
      framework,
      lesson,
      passed: true,
      source: live ? 'provider' : 'test-fixture',
      provider: lesson === 'ui-selection' ? 'typesafe' : 'openai',
      phases,
      requests: captured.length + decisions.length,
      replayRequests,
      ...(lesson === 'ui-selection'
        ? {
            firstManualChoice,
            firstConfidence,
            manualSecondChoice: true,
            lowConfidenceSecondChoice,
          }
        : {}),
    };
  } catch (error) {
    try {
      await captureFailure();
    } catch (captureError) {
      console.error(
        'Could not retain public browser failure artifacts:',
        captureError,
      );
    }
    throw error;
  } finally {
    const video = page.video();
    await page.close();
    if (video)
      await video.saveAs(
        resolve(work, `${artifactBase}${succeeded ? '' : '-failed'}.webm`),
      );
  }
}
