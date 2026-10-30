import { saveWorkbenchCapture } from './workbench-capture-file';
import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
} from '@playwright/test';
import { resolve } from 'node:path';
import { readApplicationState } from './verify-inspector-modes';
import { workbenchLocalFixtureScript } from './workbench-local-fixture';
import {
  expectNoHorizontalOverflow,
  expectWorkbenchDefaultLayout,
} from './verify-workbench-layout';

/** Verifies both actual native inference and separately labelled native API contracts. */
export async function verifyLocalWorkbench(options: {
  readonly browser: Browser;
  readonly native?: BrowserContext;
  readonly framework: string;
  readonly origin: string;
  readonly work: string;
  readonly live: boolean;
  readonly recording: boolean;
}) {
  const { framework, live, recording, work } = options;
  const page = options.native
    ? await options.native.newPage()
    : await options.browser.newPage({
        viewport: { width: 1600, height: 1000 },
      });
  const errors: string[] = [],
    posts: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() === 'POST') posts.push(request.url());
  });
  if (!live)
    await page.addInitScript({ content: workbenchLocalFixtureScript() });
  const phases: Record<string, number> = {},
    started = Date.now();
  const mark = (name: string) => {
    phases[name] = (Date.now() - started) / 1000;
  };
  const hold = async () => {
    if (recording) await page.waitForTimeout(2000);
  };
  const base = `${framework}-local-models-${live ? 'live' : 'fixture'}`;
  try {
    await page.goto(`${options.origin}/${framework}.html?lesson=local-models`);
    const root = page.locator('.wb:visible');
    await expectWorkbenchDefaultLayout(page);
    const prepare = root.locator('[data-local-prepare]');
    const send = root.locator('[data-send]');
    const status = root.locator('.wb-chat .wb-panel-head');
    const tab = async (name: string) => {
      await root.getByRole('tab', { name, exact: true }).click();
    };
    const inspection = async () => JSON.parse(await readApplicationState(root));
    const metrics = () =>
      page.evaluate(() => {
        const state = globalThis as unknown as Record<
          string,
          { creates: number; destroys: number; prompts: number }
        >;
        const value =
          state['__workbenchLocalFixture'] ?? state['__workbenchNativeMetrics'];
        return {
          creates: value.creates,
          destroys: value.destroys,
          prompts: value.prompts,
        };
      });
    if (live) {
      const available = await page.evaluate(async () => {
        const model = Reflect.get(globalThis, 'LanguageModel');
        return model
          ? model.availability({
              expectedOutputs: [{ type: 'text', languages: ['en'] }],
            })
          : 'missing';
      });
      if (available !== 'available')
        throw new Error(`Recording refuses model downloads: ${available}`);
      await page.evaluate(() => {
        const model = Reflect.get(globalThis, 'LanguageModel');
        const metrics = { creates: 0, destroys: 0, prompts: 0 };
        Reflect.set(globalThis, '__workbenchNativeMetrics', metrics);
        const create = model.create.bind(model);
        model.create = async (...args: unknown[]) => {
          metrics.creates++;
          const session = await create(...args);
          const stream = session.promptStreaming.bind(session),
            destroy = session.destroy.bind(session);
          session.promptStreaming = (...args: unknown[]) => {
            metrics.prompts++;
            return stream(...args);
          };
          session.destroy = () => {
            metrics.destroys++;
            return destroy();
          };
          return session;
        };
      });
    }
    expect(await metrics()).toMatchObject({ creates: 0, prompts: 0 });
    await expect(send).toBeDisabled();
    await prepare.click();
    await expect(send).toBeEnabled({ timeout: 30000 });
    await tab('Model');
    await hold();
    mark('prepared');
    await send.click();
    await expect(status).toContainText('complete', { timeout: 180000 });
    await expect(
      root.getByRole('button', { name: 'Accept plan', exact: true }).last(),
    ).toBeEnabled();
    await tab('JSON');
    await hold();
    mark('firstComplete');
    await root
      .getByRole('button', { name: 'Accept plan', exact: true })
      .last()
      .click();
    await tab('State');
    const first = await inspection();
    expect(first.revision).toBe(1);
    await hold();
    mark('firstAccepted');
    await root.getByRole('button', { name: 'Follow-up', exact: true }).click();
    await send.click();
    await expect(status).toContainText('complete', { timeout: 180000 });
    await expect(
      root.getByRole('button', { name: 'Accept plan', exact: true }).last(),
    ).toBeEnabled();
    await tab('JSON');
    await hold();
    mark('secondComplete');
    await root
      .getByRole('button', { name: 'Accept plan', exact: true })
      .last()
      .click();
    await tab('State');
    const second = await inspection();
    expect(second.revision).toBe(2);
    expect(second.plan.title).toBe(first.plan.title);
    expect(second.plan.steps[0]).toBe(first.plan.steps[0]);
    expect(second.plan.steps[1].length).toBeLessThan(
      first.plan.steps[1].length,
    );
    await hold();
    mark('secondAccepted');
    const before = await metrics();
    expect(before.prompts).toBe(2);
    expect(before.creates).toBe(before.destroys);
    await tab('Requests');
    await expect(root.locator('.wb-requests')).toContainText(
      'LOCAL Chrome Prompt API',
    );
    await tab('Model');
    await hold();
    const seek = root.getByRole('slider', { name: 'Seek captured event' });
    const eventCount = await seek.getAttribute('max');
    await seek.fill('0');
    await expect(prepare).toBeDisabled();
    await expect(send).toBeDisabled();
    await hold();
    mark('replay');
    await root.getByRole('button', { name: 'Play', exact: true }).click();
    await hold();
    await root
      .getByRole('button', { name: 'Return to live', exact: true })
      .click();
    expect(await metrics()).toEqual(before);
    expect(await seek.getAttribute('max')).toBe(eventCount);
    await tab('State');
    expect(await inspection()).toEqual(second);
    await hold();
    mark('returnedLive');
    await tab('Model');
    await page.screenshot({ path: resolve(work, `${base}.png`) });
    if (!live) await verifyLocalFailures(page, options.origin, framework);
    if (!recording) {
      await page.setViewportSize({ width: 390, height: 844 });
      await expectNoHorizontalOverflow(page);
    } else await page.waitForTimeout(1000);
    expect(posts).toEqual([]);
    expect(errors).toEqual([]);
    if (process.env['WORKBENCH_RECORD'] === '1')
      await saveWorkbenchCapture(page, resolve(work, `${base}.capture.json`));
    return {
      framework,
      lesson: 'local-models',
      source: live ? 'native-local' : 'test-fixture',
      provider: 'chrome-prompt-api',
      phases,
      requests: 2,
      posts: 0,
      replayPrompts: 0,
      passed: true,
    };
  } finally {
    const video = page.video();
    await page.close();
    if (video) await video.saveAs(resolve(work, `${base}.webm`));
  }
}

async function verifyLocalFailures(
  page: Page,
  origin: string,
  framework: string,
) {
  const root = page.locator('.wb:visible'),
    prepare = root.locator('[data-local-prepare]'),
    send = root.locator('[data-send]');
  const configure = (settings: Record<string, unknown>) =>
    page.evaluate(
      (settings) =>
        Object.assign(
          Reflect.get(globalThis, '__workbenchLocalFixture'),
          settings,
        ),
      settings,
    );
  await page.reload();
  await configure({ availability: 'unavailable' });
  await prepare.click();
  await expect(root.locator('[data-local-model-status]')).toContainText(
    /unavailable/i,
  );
  await expect(send).toBeDisabled();
  await configure({ availability: 'downloading', createFailure: true });
  await prepare.click();
  await expect(root.locator('[data-local-model-status]')).toContainText(
    /failure|failed/i,
  );
  await expect(send).toBeDisabled();
  await configure({
    availability: 'downloadable',
    createFailure: false,
    createDelay: 600,
  });
  await prepare.click();
  await root
    .getByRole('button', { name: 'New conversation', exact: true })
    .click();
  await page.waitForTimeout(700);
  await expect(send).toBeDisabled();
  const disposed = await page.evaluate(() =>
    Reflect.get(globalThis, '__workbenchLocalFixture'),
  );
  expect(disposed.destroys).toBe(disposed.creates - 1); // Failed create returned no session.
  await configure({ availability: 'downloadable', createDelay: 700 });
  await prepare.click();
  await expect(root.locator('[data-local-model-status]')).toContainText('45');
  await root.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.waitForTimeout(800);
  await expect(send).toBeDisabled();
  await configure({ availability: 'available', createDelay: 0 });
  await prepare.click();
  await expect(send).toBeEnabled();
  await configure({ availability: 'downloadable' });
  await send.click();
  await expect(root.locator('.wb-chat .wb-panel-head')).toContainText('error');
  const counts = await page.evaluate(() =>
    Reflect.get(globalThis, '__workbenchLocalFixture'),
  );
  expect(counts.prompts).toBe(0);
  await configure({ availability: 'available' });
  await prepare.click();
  for (const output of [
    'invalid',
    'malformed',
    'truncated',
    'extra',
    'failed',
  ]) {
    await configure({ output, streamDelay: 1 });
    await root
      .getByRole('button', { name: 'First prompt', exact: true })
      .click();
    await send.click();
    await expect(send).toBeEnabled({ timeout: 10000 });
    for (const button of await root
      .getByRole('button', { name: 'Accept plan', exact: true })
      .all())
      await expect(button).toBeDisabled();
  }
  await configure({ output: 'valid', streamDelay: 500 });
  await root.getByRole('button', { name: 'First prompt', exact: true }).click();
  await send.click();
  await expect(
    root.getByRole('button', { name: 'Stop', exact: true }),
  ).toBeEnabled();
  await root.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(root.locator('.wb-chat .wb-panel-head')).toContainText(
    'cancelled',
  );
  await configure({ streamDelay: 1 });
  await root.getByRole('button', { name: 'First prompt', exact: true }).click();
  await send.click();
  await expect(
    root.getByRole('button', { name: 'Accept plan', exact: true }).last(),
  ).toBeEnabled();
  await configure({ streamDelay: 500 });
  await root.getByRole('button', { name: 'Follow-up', exact: true }).click();
  await send.click();
  await root
    .getByRole('button', { name: 'New conversation', exact: true })
    .click();
  await page.waitForTimeout(600);
  await expect(send).toBeDisabled();
  expect(await root.locator('.wb-summary').count()).toBe(0);
  await page.goto(`${origin}/${framework}.html?lesson=local-models`);
  await page.evaluate(() =>
    Object.defineProperty(globalThis, 'LanguageModel', {
      configurable: true,
      value: undefined,
    }),
  );
  await prepare.click();
  await expect(root.locator('[data-local-model-status]')).toContainText(
    /missing/i,
  );
  await expect(send).toBeDisabled();
}
