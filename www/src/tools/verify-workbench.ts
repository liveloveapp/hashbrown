import { HashbrownTypeSafe } from '@hashbrownai/typesafe';
import { type Decision } from '@hashbrownai/core';
import { workbenchDecisionSchema } from '../../examples/quickstart/runtime/workbench';
import { verifyDecisionWorkbench } from './verify-decision-workbench';
/** Verifies the checked framework hosts with deterministic HTTP events or a real provider. */
import { type AGUIEvent, EventType, type RunAgentInput } from '@ag-ui/core';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { workbenchLessons } from '../../examples/quickstart/runtime/workbench-lessons';
import { createWorkbenchApp } from '../../examples/quickstart/server/workbench-app';

const live = process.env['WORKBENCH_LIVE'] === '1';
const eventDelayMs = process.env['WORKBENCH_RECORD'] === '1' ? 20 : 0;
async function* pacedProvider(
  events: AsyncIterable<AGUIEvent>,
  signal: AbortSignal,
) {
  for await (const event of events) {
    if (eventDelayMs)
      await new Promise((resolve) => setTimeout(resolve, eventDelayMs));
    if (signal.aborted) return;
    yield event;
  }
}
const requests: RunAgentInput[] = [];
const decisionRequests: Decision.Request[] = [];
let decisionOutcome: 'success' | 'low' | 'error' | 'delay' = 'success';
const work = resolve(
  process.env['WORKBENCH_OUTPUT'] ?? 'dist/docs-workbench/verification',
);
mkdirSync(work, { recursive: true });
let outcome: 'success' | 'error' | 'length' = 'success';
async function* fixture(
  input: RunAgentInput,
  signal: AbortSignal,
): AsyncGenerator<AGUIEvent> {
  const ids = { threadId: input.threadId, runId: input.runId };
  yield { type: EventType.RUN_STARTED, ...ids };
  const user = [...input.messages]
    .reverse()
    .find((message) => message.role === 'user');
  const offset = input.messages.findIndex((message) => message.id === user?.id);
  if (
    !input.messages.slice(offset + 1).some((message) => message.role === 'tool')
  ) {
    const toolCallId = input.runId + '-context';
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId,
      toolCallName: 'readContext',
    };
    yield { type: EventType.TOOL_CALL_ARGS, toolCallId, delta: '{}' };
    yield { type: EventType.TOOL_CALL_END, toolCallId };
    yield {
      type: EventType.RUN_FINISHED,
      ...ids,
      metadata: { hashbrown: { finishReason: 'tool_calls' } },
    };
    return;
  }
  const second =
    input.messages.filter((message) => message.role === 'user').length > 1;
  const messageId = `${input.runId}-answer`;
  const ui = {
    ui: [
      {
        SummaryCard: {
          props: {
            title: 'Show a trusted component',
            steps: [
              'Expose a SummaryCard',
              second
                ? 'Record a demo'
                : 'Record a short demo of the generated interface',
            ],
          },
        },
      },
    ],
  };
  const format = (input.forwardedProps as { hashbrown?: { ui?: boolean } })
    ?.hashbrown?.ui;
  const json = JSON.stringify(format ? ui : ui.ui[0].SummaryCard.props);
  yield { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' };
  for (let index = 0; index < json.length; index += 14) {
    await new Promise((done) => setTimeout(done, 80));
    if (signal.aborted) return;
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta: json.slice(index, index + 14),
    };
  }
  yield { type: EventType.TEXT_MESSAGE_END, messageId };
  // Leave a visible complete-looking preview before the terminal verdict.
  await new Promise((done) => setTimeout(done, 400));
  yield outcome === 'error'
    ? { type: EventType.RUN_ERROR, message: 'Intentional test failure' }
    : {
        type: EventType.RUN_FINISHED,
        ...ids,
        metadata: {
          hashbrown: { finishReason: outcome === 'length' ? 'length' : 'stop' },
        },
      };
}
const apiKey = process.env['OPENAI_API_KEY'];
const model = process.env['OPENAI_MODEL'];
if (live && (!apiKey || !model))
  throw new Error(
    'Live verification requires OPENAI_API_KEY and OPENAI_MODEL.',
  );
const app = createWorkbenchApp({
  decide: async (request, signal) => {
    decisionRequests.push(structuredClone(request));
    if (live) {
      const key = process.env['TYPESAFE_API_KEY'],
        model = process.env['TYPESAFE_MODEL'];
      if (!key || !model)
        throw new Error(
          'Live decisions require TYPESAFE_API_KEY and TYPESAFE_MODEL',
        );
      return HashbrownTypeSafe.decide({
        apiKey: key,
        model,
        request,
        schema: workbenchDecisionSchema,
        signal,
        maxRequestChars: 16000,
      });
    }
    const mode = decisionOutcome;
    if (mode === 'delay')
      await new Promise((resolve) => setTimeout(resolve, 600));
    if (mode === 'error') throw new Error('Intentional decision failure');
    const input = (request.state as { input: { prompt: string } }).input;
    const choice = input.prompt.toLowerCase().includes('recorded')
      ? 'review'
      : 'record';
    const confidence = mode === 'low' ? 0.4 : 0.97;
    return {
      kind: 'hashbrown.decision',
      version: 1,
      value: { nextAction: choice },
      meta: {
        nextAction: {
          confidence,
          probabilities:
            choice === 'record'
              ? {
                  record: confidence,
                  review: (1 - confidence) / 2,
                  clarify: (1 - confidence) / 2,
                }
              : {
                  record: (1 - confidence) / 2,
                  review: confidence,
                  clarify: (1 - confidence) / 2,
                },
        },
      },
    };
  },
  staticDirectory: resolve('dist/docs-workbench/browser'),
  source: live ? 'provider' : 'test-fixture',
  stream: (input, signal) => {
    requests.push(structuredClone(input));
    return live
      ? pacedProvider(
          HashbrownOpenAI.stream.text({
            apiKey: apiKey as string,
            model: model as string,
            input,
            signal,
            transformRequestOptions: (value) => ({
              ...value,
              max_output_tokens: 2048,
            }),
          }),
          signal,
        )
      : fixture(input, signal);
  },
});
const server = createServer(app);
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
if (!address || typeof address === 'string')
  throw new Error('Missing verification port');
const browser = await chromium.launch({ headless: true }).catch((error) => {
  if (process.env['CI']) throw error;
  return chromium.launch({ headless: true, channel: 'chrome' });
});
const requestedLessons = process.env['WORKBENCH_LESSONS']?.split(',');
if (
  requestedLessons?.some(
    (id) => !workbenchLessons.some((lesson) => lesson.id === id),
  )
)
  throw new Error('Unknown WORKBENCH_LESSONS value');
const lessons = workbenchLessons.filter(
  (lesson) => !requestedLessons || requestedLessons.includes(lesson.id),
);
const report: unknown[] = [];
try {
  for (const lesson of lessons) {
    for (const framework of ['react', 'angular']) {
      if (lesson.format === 'decision') {
        report.push(
          await verifyDecisionWorkbench({
            browser,
            framework,
            origin: `http://127.0.0.1:${address.port}`,
            work,
            live,
            recording: process.env['WORKBENCH_RECORD'] === '1',
            requests: decisionRequests,
            outcome: (value) => {
              decisionOutcome = value;
            },
          }),
        );
        continue;
      }
      console.log(
        `Verifying ${framework}/${lesson.id} (${live ? 'provider' : 'test-fixture'})`,
      );
      const errors: string[] = [];
      const page = await browser.newPage({
        viewport: { width: 1600, height: 1000 },
        ...(process.env['WORKBENCH_RECORD'] === '1'
          ? { recordVideo: { dir: work, size: { width: 1600, height: 1000 } } }
          : {}),
      });
      const captureStarted = Date.now();
      const phases: Record<string, number> = {};
      const mark = (name: string) => {
        phases[name] = (Date.now() - captureStarted) / 1000;
      };
      page.on('pageerror', (error) => {
        errors.push(error.message);
        console.log(`${framework} browser error: ${error.message}`);
      });
      page.on('console', (message) => {
        if (message.type() === 'error')
          console.log(`${framework} console: ${message.text()}`);
      });
      const previewTitles: string[] = [];
      if (lesson.id === 'streaming') {
        await page.exposeFunction(
          '__captureStreamingPreview',
          (title: string) => {
            if (!previewTitles.includes(title)) previewTitles.push(title);
          },
        );
      }
      const start = requests.length;
      await page.goto(
        `http://127.0.0.1:${address.port}/${framework}.html?lesson=${lesson.id}`,
      );
      const send = page.locator('.wb:visible [data-send]');
      const newConversation = async () => {
        const selected = page.locator(
          '.wb:visible .wb-nav [aria-pressed=true]',
        );
        const before = await selected.innerText();
        await page
          .getByRole('button', { name: 'New conversation', exact: true })
          .click();
        try {
          await expect(selected).not.toHaveText(before);
        } catch (error) {
          await page.screenshot({
            path: resolve(
              work,
              `${framework}-${lesson.id}-navigation-failure.png`,
            ),
            fullPage: true,
            animations: 'disabled',
          });
          console.log('Navigation errors:', JSON.stringify(errors));
          throw error;
        }
      };
      await expect(send).toBeVisible();
      if (lesson.id === 'streaming') {
        await page.evaluate(() => {
          const record = (
            window as unknown as {
              __captureStreamingPreview: (title: string) => void;
            }
          ).__captureStreamingPreview;
          new MutationObserver(() => {
            const cards = document.querySelectorAll(
              'article[aria-label="Summary card"]',
            );
            const card = cards[cards.length - 1];
            const title = card?.querySelector('h2')?.textContent;
            if (
              title &&
              title !== 'Building your plan…' &&
              card?.querySelector<HTMLButtonElement>('button')?.disabled
            )
              record(title);
          }).observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
          });
        });
      }

      await expect(page.locator('.wb:visible .wb-inspector')).toBeVisible();
      await expect(page.locator('.wb:visible .wb-detail')).toBeVisible();
      await expect(
        page.getByRole('tab', { name: lesson.inspector, exact: true }),
      ).toHaveAttribute('aria-selected', 'true');
      if (lesson.id === 'generative-ui')
        await page.getByRole('tab', { name: 'JSON', exact: true }).click();
      if (process.env['WORKBENCH_RECORD'] === '1')
        await page.waitForTimeout(800);
      mark('firstRequest');
      await send.click();
      const card = page.getByRole('article', { name: 'Summary card' }).last();
      await expect(card).toBeVisible({ timeout: 60_000 });
      const accept = card.getByRole('button', {
        name: 'Accept plan',
        exact: true,
      });
      if (!live) await expect(accept).toBeDisabled();
      if (lesson.id === 'streaming' && !live)
        await expect(card.locator('h2')).not.toHaveText('Building your plan…');
      await expect(accept).toBeEnabled({ timeout: 60_000 });
      await expect(page.locator('.wb:visible [data-source]')).toHaveText(
        live ? 'Live model' : 'Test fixture',
      );
      if (lesson.id === 'streaming') {
        const title = await card.locator('h2').innerText();
        expect(
          previewTitles.some(
            (partial) =>
              partial.length < title.length && title.startsWith(partial),
          ),
        ).toBe(true);
      }
      const firstSteps = await card.locator('li').allTextContents();
      expect(firstSteps).toHaveLength(2);
      mark('firstComplete');
      await page.getByRole('tab', { name: 'State', exact: true }).click();
      await expect(
        page.locator('.wb:visible .wb-inspector .wb-inspection'),
      ).toContainText('"revision": 0');
      if (process.env['WORKBENCH_RECORD'] === '1')
        await page.waitForTimeout(900);
      mark('accept');
      await accept.click();
      await expect(
        page.locator('.wb:visible .wb-inspector .wb-inspection'),
      ).toContainText('"revision": 1');
      if (process.env['WORKBENCH_RECORD'] === '1')
        await page.waitForTimeout(900);
      await page
        .getByRole('tab', {
          name:
            lesson.id === 'schemas'
              ? 'Schema'
              : lesson.id === 'tools'
                ? 'Requests'
                : 'JSON',
          exact: true,
        })
        .click();
      await page
        .getByRole('button', { name: 'Follow-up', exact: true })
        .click();
      mark('followup');
      await send.click();
      await expect(
        page.getByRole('article', { name: 'Summary card' }),
      ).toHaveCount(2, { timeout: 60_000 });
      await expect(
        page
          .getByRole('article', { name: 'Summary card' })
          .last()
          .getByRole('button', { name: 'Accept plan', exact: true }),
      ).toBeEnabled({ timeout: 60_000 });
      if (process.env['WORKBENCH_RECORD'] === '1')
        await page.waitForTimeout(900);
      await page.getByRole('tab', { name: 'State', exact: true }).click();
      const revisedSteps = await page
        .getByRole('article', { name: 'Summary card' })
        .last()
        .locator('li')
        .allTextContents();
      expect(revisedSteps).toHaveLength(2);
      expect(revisedSteps[0]).toBe(firstSteps[0]);
      expect(revisedSteps[1].length).toBeLessThan(firstSteps[1].length);
      mark('secondComplete');
      const captured = requests.slice(start);
      expect(captured.length).toBeGreaterThanOrEqual(4);
      if (!live) expect(captured).toHaveLength(4);
      const tool = [...captured[captured.length - 1].messages]
        .reverse()
        .find((message) => message.role === 'tool');
      expect(tool?.content).toContain('"revision":1');
      const grouped = new Map<string, RunAgentInput[]>();
      for (const request of captured) {
        const id = [...request.messages]
          .reverse()
          .find((message) => message.role === 'user')?.id;
        if (!id) throw new Error('Missing user origin');
        grouped.set(id, [...(grouped.get(id) ?? []), request]);
      }
      expect(grouped.size).toBe(2);
      [...grouped.values()].forEach((turn, index) => {
        const final = turn.at(-1);
        if (!final) throw new Error('Missing turn request');
        const userIndex = final.messages
          .map((message) => message.role)
          .lastIndexOf('user');
        const results = final.messages
          .slice(userIndex + 1)
          .filter((message) => message.role === 'tool');
        expect(results).toHaveLength(1);
        expect(JSON.parse(String(results[0].content)).revision).toBe(index);
      });
      const count = requests.length;
      mark('replay');
      if (process.env['WORKBENCH_RECORD'] === '1')
        await page.getByRole('tab', { name: 'JSON', exact: true }).click();
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await expect(page.locator('[data-replay]')).toBeVisible();
      await expect(send).toBeDisabled();
      if (process.env['WORKBENCH_RECORD'] === '1')
        await page.waitForTimeout(2200);
      const pause = page.getByRole('button', { name: 'Pause', exact: true });
      if (await pause.count()) await pause.click();
      await page
        .getByRole('button', { name: /^Parsed output[.]/ })
        .first()
        .click();
      await expect(page.locator('[data-replay] .wb-summary')).toHaveCount(1);
      if (process.env['WORKBENCH_RECORD'] === '1')
        await page.waitForTimeout(600);
      await page.getByRole('tab', { name: 'State', exact: true }).click();
      await page
        .getByRole('button', { name: /^Plan accepted[.]/ })
        .first()
        .click();
      await expect(
        page.locator('.wb:visible .wb-inspector .wb-inspection'),
      ).toContainText('"revision": 1');
      if (process.env['WORKBENCH_RECORD'] === '1')
        await page.waitForTimeout(700);
      const slider = page.getByRole('slider', { name: 'Seek captured event' });
      await slider.fill('0');
      await expect(
        page.locator('.wb:visible .wb-inspector .wb-inspection'),
      ).toContainText('"revision": 0');
      await expect(page.locator('[data-replay]')).not.toContainText(
        'Record a demo',
      );
      await page
        .getByRole('button', { name: 'Return to live', exact: true })
        .click();
      await expect(
        page.locator('.wb:visible .wb-inspector .wb-inspection'),
      ).toContainText('"revision": 1');
      expect(requests).toHaveLength(count);
      mark('returnedLive');
      if (process.env['WORKBENCH_RECORD'] !== '1') {
        await newConversation();
        await expect(
          page.getByRole('article', { name: 'Summary card' }),
        ).toHaveCount(0);
        await page
          .getByRole('button', { name: 'Two-step plan', exact: true })
          .click();
        await expect(
          page.getByRole('article', { name: 'Summary card' }),
        ).toHaveCount(2);
        await expect(
          page.locator('.wb:visible .wb-inspector .wb-inspection'),
        ).toContainText('"revision": 1');
        expect(requests).toHaveLength(count);
      }
      await page
        .getByRole('tab', {
          name:
            lesson.id === 'schemas'
              ? 'Schema'
              : lesson.id === 'tools'
                ? 'Requests'
                : 'JSON',
          exact: true,
        })
        .click();
      await page.screenshot({
        path: resolve(
          work,
          `${framework}-${lesson.id}-${live ? 'live' : 'fixture'}.png`,
        ),
        fullPage: true,
        animations: 'disabled',
      });
      if (!live) {
        for (const failed of ['error', 'length'] as const) {
          await newConversation();
          outcome = failed;
          await send.click();
          await expect(page.getByRole('alert').first()).toBeVisible({
            timeout: 15_000,
          });
          await expect(
            page.locator('.wb:visible .wb-summary button:enabled'),
          ).toHaveCount(0);
        }
        outcome = 'success';
        await newConversation();
        await send.click();
        await expect(
          page.getByRole('button', { name: 'Stop', exact: true }),
        ).toBeEnabled();
        await page.getByRole('button', { name: 'Stop', exact: true }).click();
        await expect(
          page.locator('.wb:visible .wb-chat .wb-panel-head'),
        ).toContainText(/cancelled/);
      }
      if (process.env['WORKBENCH_RECORD'] !== '1') {
        await page.setViewportSize({ width: 390, height: 844 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      } else {
        await page.waitForTimeout(800);
      }
      if (!live) {
        const beforeNavigation = requests.length;
        const target = lesson.id === 'tools' ? 'structured-output' : 'tools';
        await page
          .locator(`.wb:visible .wb-lessons a[href$="lesson=${target}"]`)
          .click();
        await expect(page.locator('.wb:visible [data-send]')).toBeEnabled();
        await expect(page.locator('.wb:visible .wb-summary')).toHaveCount(0);
        expect(requests).toHaveLength(beforeNavigation);
      }
      expect(errors).toEqual([]);
      report.push({
        framework,
        lesson: lesson.id,
        phases,
        eventDelayMs,
        ...(lesson.id === 'streaming' ? { previewTitles } : {}),
        source: live ? 'provider' : 'test-fixture',
        requests: captured.length,
        passed: true,
      });
      const video = page.video();
      await page.close();
      if (video)
        await video.saveAs(
          resolve(
            work,
            `${framework}-${lesson.id}-${live ? 'live' : 'fixture'}.webm`,
          ),
        );
    }
  }
  writeFileSync(
    resolve(work, `${live ? 'live' : 'fixture'}-report.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  await new Promise<void>((done) => server.close(() => done()));
}
