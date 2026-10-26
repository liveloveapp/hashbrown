/** Verifies the checked framework hosts with deterministic HTTP events or a real provider. */
import { type AGUIEvent, EventType, type RunAgentInput } from '@ag-ui/core';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createWorkbenchApp } from '../../examples/quickstart/server/workbench-app';

const live = process.env['WORKBENCH_LIVE'] === '1';
const requests: RunAgentInput[] = [];
const work = resolve('dist/docs-workbench/verification');
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
  const json = JSON.stringify({
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
  });
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
  staticDirectory: resolve('dist/docs-workbench/browser'),
  source: live ? 'provider' : 'test-fixture',
  stream: (input, signal) => {
    requests.push(structuredClone(input));
    return live
      ? HashbrownOpenAI.stream.text({
          apiKey: apiKey as string,
          model: model as string,
          input,
          signal,
          transformRequestOptions: (value) => ({
            ...value,
            max_output_tokens: 2048,
          }),
        })
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
const report: unknown[] = [];
try {
  for (const framework of ['react', 'angular']) {
    console.log(
      `Verifying ${framework} (${live ? 'provider' : 'test-fixture'})`,
    );
    const errors: string[] = [];
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1000 },
      ...(process.env['WORKBENCH_RECORD'] === '1'
        ? { recordVideo: { dir: work, size: { width: 1600, height: 1000 } } }
        : {}),
    });
    page.on('pageerror', (error) => {
      errors.push(error.message);
      console.log(`${framework} browser error: ${error.message}`);
    });
    page.on('console', (message) => {
      if (message.type() === 'error')
        console.log(`${framework} console: ${message.text()}`);
    });
    const start = requests.length;
    await page.goto(`http://127.0.0.1:${address.port}/${framework}.html`);
    const send = page.locator('.wb:visible [data-send]');
    const newConversation = async () => {
      const selected = page.locator('.wb:visible .wb-nav [aria-pressed=true]');
      const before = await selected.innerText();
      await page
        .getByRole('button', { name: 'New conversation', exact: true })
        .click();
      try {
        await expect(selected).not.toHaveText(before);
      } catch (error) {
        await page.screenshot({
          path: resolve(work, `${framework}-navigation-failure.png`),
          fullPage: true,
        });
        console.log('Navigation errors:', JSON.stringify(errors));
        throw error;
      }
    };
    await expect(send).toBeVisible();
    if (process.env['WORKBENCH_RECORD'] === '1') await page.waitForTimeout(800);
    await send.click();
    const card = page.getByRole('article', { name: 'Summary card' }).last();
    await expect(card).toBeVisible({ timeout: 60_000 });
    const accept = card.getByRole('button', {
      name: 'Accept plan',
      exact: true,
    });
    if (!live) await expect(accept).toBeDisabled();
    await expect(accept).toBeEnabled({ timeout: 60_000 });
    await expect(page.locator('.wb:visible [data-source]')).toHaveText(
      live ? 'Live model' : 'Test fixture',
    );
    await page.getByRole('tab', { name: 'State', exact: true }).click();
    await expect(
      page.locator('.wb:visible .wb-inspector .wb-inspection'),
    ).toContainText('"revision": 0');
    if (process.env['WORKBENCH_RECORD'] === '1') await page.waitForTimeout(900);
    await accept.click();
    await expect(
      page.locator('.wb:visible .wb-inspector .wb-inspection'),
    ).toContainText('"revision": 1');
    if (process.env['WORKBENCH_RECORD'] === '1') await page.waitForTimeout(900);
    await page.getByRole('tab', { name: 'JSON', exact: true }).click();
    await page.getByRole('button', { name: 'Follow-up', exact: true }).click();
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
    if (process.env['WORKBENCH_RECORD'] === '1') await page.waitForTimeout(900);
    await page.getByRole('tab', { name: 'State', exact: true }).click();
    const captured = requests.slice(start);
    expect(captured.length).toBeGreaterThanOrEqual(4);
    if (!live) expect(captured).toHaveLength(4);
    const tool = [...captured[captured.length - 1].messages]
      .reverse()
      .find((message) => message.role === 'tool');
    expect(tool?.content).toContain('"revision":1');
    const count = requests.length;
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('[data-replay]')).toBeVisible();
    await expect(send).toBeDisabled();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
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
    await page.screenshot({
      path: resolve(work, `${framework}-${live ? 'live' : 'fixture'}.png`),
      fullPage: true,
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
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    report.push({
      framework,
      source: live ? 'provider' : 'test-fixture',
      requests: captured.length,
      passed: true,
    });
    const video = page.video();
    await page.close();
    if (video)
      await video.saveAs(
        resolve(work, `${framework}-${live ? 'live' : 'fixture'}.webm`),
      );
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
