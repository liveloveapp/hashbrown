/** Checks real local-model clients against native API contracts, then records native Chrome inference. */
import {
  type BrowserContext,
  chromium,
  expect,
  type Page,
} from '@playwright/test';
import express from 'express';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { build } from 'vite';
import {
  assertLocalRecordingAllowed,
  createLocalModelInitScript,
  type LocalModelFixture,
  selectLocalModelModes,
} from './docs-local-models-fixtures';
import type { RecipePhase } from './docs-recipe-browser';
import { cropRecipeScreenshot, encodeRecipeVideo } from './docs-recipe-video';

assertLocalRecordingAllowed(process.env['CI']);
selectLocalModelModes(process.env['DOCS_DEMO_MODES']);
const record = process.env['DOCS_SKIP_RECORDING'] !== '1';
const work = resolve('dist/docs-local-models');
const compiled = resolve('dist/docs-quickstart/compiled');
const assets = resolve('www/public/video/docs');
const profile = '/tmp/hashbrown-native-model-profile';
mkdirSync(work, { recursive: true });
mkdirSync(assets, { recursive: true });
const css = `*{box-sizing:border-box}body{margin:0;background:#faf9f0;color:#302820;font:18px/1.5 Arial,sans-serif}header{height:88px;padding:24px 64px;border-bottom:1px solid #e7dfce;display:flex;justify-content:space-between;align-items:center}.tag{font-size:12px;letter-spacing:1.5px;text-transform:uppercase}.brand{font-size:22px;color:#8a571f;font-weight:bold}main{width:min(920px,calc(100% - 40px));margin:30px auto 100px}h1{font-size:34px;line-height:1.2;margin:0 0 20px}h2{font-size:21px;margin:12px 0}label{display:block;font-size:15px;margin-bottom:7px}textarea{display:block;width:100%;height:115px;padding:16px;border:1px solid #cbbfa9;border-radius:10px;font:18px/1.5 Arial,sans-serif;background:#fff;resize:none;margin-bottom:15px}button{font:600 16px Arial;border:0;border-radius:10px;padding:12px 18px;background:#fbbb52;color:#302820;margin:0 8px 8px 0;cursor:pointer}button:disabled{opacity:.45}[role=status]{font-size:15px;color:#695a44;min-height:28px;margin:15px 0}section[aria-label="Trip brief"]{border:1px solid #dfd8c8;border-radius:12px;padding:20px 24px;background:#fff;min-height:145px;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:150px 1fr;gap:12px;margin:12px 0}dt{font-size:15px;color:#786c5e}dd{font-weight:600;margin:0}footer{position:fixed;bottom:0;width:100%;padding:17px 64px;border-top:1px solid #e7dfce;background:#faf9f0;color:#786c5e;font-size:12px;display:flex;justify-content:space-between;gap:20px}@media(max-width:600px){header,footer{padding:16px 20px}header{height:72px}main{margin-top:20px}h1{font-size:28px}footer{font-size:10px}section[aria-label="Trip brief"]{padding:14px 16px}dl{grid-template-columns:110px 1fr}}`;
for (const sdk of ['react', 'angular']) {
  writeFileSync(
    resolve(compiled, `${sdk}-local-models.html`),
    `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hashbrown browser-local trip brief</title><style>${css}</style><body><header><span class="tag">Hashbrown / browser-local models</span><span class="brand">hashbrown</span></header><div id="root"></div><app-local-models></app-local-models><footer><span>Native Chrome inference · typed trip brief</span><span>Presentation styles added · no API key · no narration</span></footer><script type="module" src="/${sdk}-local-models-entry.js"></script></body></html>`,
  );
  writeFileSync(
    resolve(compiled, `${sdk}-local-models-entry.js`),
    sdk === 'react'
      ? `import React from'react';import{createRoot}from'react-dom/client';import{HashbrownProvider}from'@hashbrownai/react';import{LocalModels}from'./react/src/LocalModels.js';createRoot(document.getElementById('root')).render(React.createElement(HashbrownProvider,{telemetry:false},React.createElement(LocalModels)));`
      : `import'@angular/compiler';import{bootstrapApplication}from'@angular/platform-browser';import{provideZonelessChangeDetection}from'@angular/core';import{provideHashbrown}from'@hashbrownai/angular';import{LocalModels}from'./angular/src/app/local-models.js';bootstrapApplication(LocalModels,{providers:[provideZonelessChangeDetection(),provideHashbrown({telemetry:false})]}).catch(console.error);`,
  );
}
await build({
  configFile: false,
  root: compiled,
  resolve: {
    alias: Object.fromEntries(
      ['core', 'react', 'angular'].map((pkg) => [
        `@hashbrownai/${pkg}`,
        resolve(`dist/packages/${pkg}`),
      ]),
    ),
  },
  build: {
    outDir: resolve(work, 'browser'),
    emptyOutDir: true,
    rollupOptions: {
      input: ['react', 'angular'].map((sdk) =>
        resolve(compiled, `${sdk}-local-models.html`),
      ),
    },
  },
});
const app = express();
app.use(express.static(resolve(work, 'browser')));
app.use('/media', express.static(assets));
const server = createServer(app);
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
if (!address || typeof address === 'string')
  throw new Error('Missing local-model recorder port');
const origin = `http://127.0.0.1:${address.port}`;
const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true });
const status = (page: Page) => page.getByRole('status');
const preview = (page: Page) =>
  page.getByRole('region', { name: 'Trip brief', exact: true });
const results: Record<string, unknown>[] = [];
async function configure(page: Page, options: Partial<LocalModelFixture>) {
  await page.evaluate((next) => {
    Object.assign(Reflect.get(globalThis, '__localModelFixture'), next);
  }, options);
}
async function metrics(page: Page): Promise<LocalModelFixture> {
  return page.evaluate(() => Reflect.get(globalThis, '__localModelFixture'));
}
async function prepare(page: Page) {
  const before = (await metrics(page)).availabilityCalls;
  await button(page, 'Prepare model').click();
  await expect
    .poll(async () => (await metrics(page)).availabilityCalls)
    .toBeGreaterThan(before);
}
async function generate(page: Page) {
  const before = (await metrics(page)).prompts;
  await button(page, 'Generate locally').click();
  await expect.poll(async () => (await metrics(page)).prompts).toBe(before + 1);
}
async function assertTrip(
  page: Page,
  destination = 'Lisbon',
  days = 3,
  timeout = 5000,
) {
  await expect(status(page)).toHaveText('Trip brief ready.', { timeout });
  await expect(preview(page).locator('dd')).toHaveText([
    destination,
    String(days),
  ]);
  await expect(button(page, 'Generate locally')).toBeEnabled();
}
async function openShim(context: BrowserContext, sdk: string) {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/${sdk}-local-models.html`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.waitForTimeout(250);
  expect(errors).toEqual([]);
  expect(await metrics(page)).toMatchObject({
    availabilityCalls: 0,
    creates: 0,
    prompts: 0,
  });
  expect(
    await page.evaluate(() => {
      const descriptor = Object.getOwnPropertyDescriptor(
        globalThis,
        'LanguageModel',
      );
      return (
        descriptor &&
        Object.hasOwn(descriptor, 'value') &&
        descriptor.writable === true
      );
    }),
  ).toBe(true);
  return page;
}
async function verifyShim(context: BrowserContext, sdk: string) {
  // Each case starts at the same actual client mount; only LanguageModel is replaced.
  for (const availability of ['missing', 'unavailable']) {
    const page = await openShim(context, sdk);
    if (availability === 'missing') {
      // Deleting an own shim can reveal Chrome's lazy native constructor.
      // Shadow it explicitly so this case cannot fall through to the real API.
      await page.evaluate(() => {
        Object.defineProperty(globalThis, 'LanguageModel', {
          configurable: true,
          writable: true,
          value: undefined,
        });
      });
      expect(
        await page.evaluate(() => Reflect.get(globalThis, 'LanguageModel')),
      ).toBeUndefined();
    } else {
      await configure(page, { availability });
      expect(
        await page.evaluate(async () => {
          const model = Reflect.get(globalThis, 'LanguageModel') as {
            availability(): Promise<string>;
          };
          return model.availability();
        }),
      ).toBe('unavailable');
    }
    await button(page, 'Prepare model').click();
    await expect(status(page)).toContainText(
      /missing|unavailable|not available|not supported/i,
    );
    expect((await metrics(page)).creates).toBe(0);
    await expect(button(page, 'Generate locally')).toBeDisabled();
    await page.close();
  }
  for (const availability of ['downloadable', 'downloading']) {
    const page = await openShim(context, sdk);
    await configure(page, { availability, createDelay: 800 });
    await prepare(page);
    await expect(status(page)).toContainText('45%');
    await expect(button(page, 'Generate locally')).toBeDisabled();
    await expect(status(page)).toContainText('Model ready.');
    expect(await metrics(page)).toMatchObject({
      creates: 1,
      destroys: 1,
      prompts: 0,
    });
    await page.close();
  }
  {
    const page = await openShim(context, sdk);
    await configure(page, {
      availability: 'downloadable',
      createFailure: true,
      createDelay: 400,
    });
    await prepare(page);
    await expect(status(page)).toContainText(/failed|could not|try again/i);
    await expect(button(page, 'Generate locally')).toBeDisabled();
    await configure(page, { createFailure: false });
    await prepare(page);
    await expect(status(page)).toContainText('Model ready.');
    expect((await metrics(page)).destroys).toBe(1);
    await page.close();
  }
  {
    const page = await openShim(context, sdk);
    await configure(page, { availability: 'downloadable', createDelay: 1400 });
    await prepare(page);
    await expect.poll(async () => (await metrics(page)).creates).toBe(1);
    await button(page, 'Cancel').click();
    await expect(status(page)).toContainText('Stopped.');
    await expect.poll(async () => (await metrics(page)).destroys).toBe(1);
    await expect(status(page)).toContainText('Stopped.');
    await configure(page, { availability: 'available', createDelay: 0 });
    await prepare(page);
    await expect(status(page)).toContainText('Model ready.');
    await generate(page);
    await assertTrip(page);
    await page.close();
  }
  {
    const page = await openShim(context, sdk);
    await prepare(page);
    await expect(status(page)).toContainText('Model ready.');
    expect((await metrics(page)).creates).toBe(0);
    // A change after preparation cannot cause Generate to download implicitly.
    await configure(page, { availability: 'downloadable' });
    const before = (await metrics(page)).availabilityCalls;
    await button(page, 'Generate locally').click();
    await expect
      .poll(async () => (await metrics(page)).availabilityCalls)
      .toBeGreaterThan(before);
    await expect(status(page)).toContainText(/prepare|failed/i);
    expect((await metrics(page)).creates).toBe(0);
    expect((await metrics(page)).prompts).toBe(0);
    await page.close();
  }
  {
    const page = await openShim(context, sdk);
    await prepare(page);
    await expect(status(page)).toContainText('Model ready.');
    await generate(page);
    await assertTrip(page);
    for (const output of [
      'invalid',
      'malformed',
      'truncated',
      'failed',
    ] as const) {
      await configure(page, { output, streamDelay: 500 });
      await generate(page);
      await expect(preview(page).locator('dd')).toHaveCount(0);
      await expect(button(page, 'Generate locally')).toBeEnabled();
      await expect(status(page)).not.toHaveText('Trip brief ready.');
      await expect(preview(page).locator('dd')).toHaveCount(0);
    }
    await configure(page, { output: 'valid', streamDelay: 1300 });
    await generate(page);
    await expect(preview(page).locator('dd')).toHaveCount(0);
    await button(page, 'Cancel').click();
    await expect(status(page)).toContainText('Stopped.');
    await configure(page, { destination: 'Porto', days: 2, streamDelay: 0 });
    await page
      .getByLabel('Trip request', { exact: true })
      .fill('Two days in Porto.');
    await generate(page);
    await assertTrip(page, 'Porto', 2);
    await page.waitForTimeout(1400);
    await assertTrip(page, 'Porto', 2);
    await expect
      .poll(async () => {
        const current = await metrics(page);
        return current.destroys === current.creates;
      })
      .toBe(true);
    const state = await metrics(page);
    const latest = state.calls.at(-1);
    expect(latest?.messages).toEqual([
      { role: 'user', content: 'Two days in Porto.' },
    ]);
    expect(latest?.options).toMatchObject({
      responseConstraint: { type: 'object', required: ['destination', 'days'] },
    });
    await page.close();
  }
  results.push({
    sdk,
    scope:
      'Deterministic LanguageModel API shim through the actual experimental_chrome transport; not model-quality evidence.',
    preparation: true,
    progress: true,
    cancellation: true,
    lateCleanup: true,
    validation: true,
    failedOutput: true,
    recovery: true,
    latestRunIsolation: true,
    passed: true,
  });
}
async function nativeAvailability(page: Page) {
  const availability = await page.evaluate(async () => {
    const model = Reflect.get(globalThis, 'LanguageModel') as
      { availability(options: object): Promise<string> } | undefined;
    return model
      ? model.availability({
          expectedOutputs: [{ type: 'text', languages: ['en'] }],
        })
      : 'missing';
  });
  if (availability !== 'available')
    throw new Error(
      `Native model must already be available; got ${availability}. This recorder never downloads models.`,
    );
  return availability;
}
async function nativeTrip(
  page: Page,
  phase: (text: string) => void = () => undefined,
) {
  await nativeAvailability(page);
  phase('Prepare the already available browser model. No download is started.');
  await button(page, 'Prepare model').click();
  await expect(status(page)).toContainText('Model ready.');
  await page.waitForTimeout(1000);
  await nativeAvailability(page);
  await page
    .getByLabel('Trip request', { exact: true })
    .fill('Three days in Lisbon.');
  phase('Generate a typed trip brief using native Chrome inference.');
  const requested = Date.now();
  await button(page, 'Generate locally').click();
  await assertTrip(page, 'Lisbon', 3, 90_000);
  phase('The completed, validated result contains Lisbon and three days.');
  return { requestToReadyMs: Date.now() - requested };
}
let shimBrowser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let nativeContext: BrowserContext | undefined;
try {
  shimBrowser = await chromium.launch();
  for (const sdk of ['react', 'angular']) {
    const context = await shimBrowser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await context.addInitScript({ content: createLocalModelInitScript() });
    const errors: string[] = [];
    const applicationPosts: string[] = [];
    context.on('request', (request) => {
      if (request.method() === 'POST') applicationPosts.push(request.url());
    });
    context.on('page', (page) =>
      page.on('pageerror', (error) => errors.push(error.message)),
    );
    try {
      await verifyShim(context, sdk);
    } catch (error) {
      const failed = context.pages().at(-1);
      if (failed) {
        await failed.screenshot({
          path: resolve(work, `${sdk}-shim-failure.png`),
        });
        writeFileSync(
          resolve(work, `${sdk}-shim-failure.txt`),
          await failed.locator('main').innerText(),
        );
      }
      throw error;
    }
    expect(errors).toEqual([]);
    expect(applicationPosts).toEqual([]);
    await context.close();
    const mobile = await shimBrowser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await mobile.addInitScript({ content: createLocalModelInitScript() });
    const page = await openShim(mobile, sdk);
    await prepare(page);
    await expect(status(page)).toContainText('Model ready.');
    await generate(page);
    await assertTrip(page);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page.screenshot({ path: resolve(work, `${sdk}-mobile-shim.png`) });
    results.push({
      sdk,
      mobileLayout: true,
      scope: 'Desktop API shim only; native mobile inference is unsupported.',
      passed: true,
    });
    await mobile.close();
  }
  await shimBrowser.close();
  shimBrowser = undefined;
  nativeContext = await chromium.launchPersistentContext(profile, {
    channel: 'chrome',
    headless: false,
    args: ['--disable-features='],
    ignoreDefaultArgs: [
      '--disable-component-update',
      '--disable-background-networking',
      '--disable-field-trial-config',
    ],
    viewport: { width: 1440, height: 900 },
    ...(record
      ? {
          recordVideo: {
            dir: resolve(work, 'raw'),
            size: { width: 1440, height: 900 },
          },
        }
      : {}),
  });
  const errors: string[] = [];
  const nativeApplicationPosts: string[] = [];
  nativeContext.on('request', (request) => {
    if (request.method() === 'POST') nativeApplicationPosts.push(request.url());
  });
  nativeContext.on('page', (page) =>
    page.on('pageerror', (error) => errors.push(error.message)),
  );
  // Keep the initial blank tab open so closing a verification page cannot
  // terminate the dedicated persistent browser before the next framework runs.
  let browserVersion = '';
  for (const sdk of ['react', 'angular']) {
    const page = await nativeContext.newPage();
    await page.goto(`${origin}/${sdk}-local-models.html`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    browserVersion = await page.evaluate(() => navigator.userAgent);
    const measured = await nativeTrip(page);
    await page.screenshot({
      path: resolve(work, `${sdk}-native-verified.png`),
    });
    results.push({
      sdk,
      browserVersion,
      profile,
      availability: 'available',
      actualNativeInference: true,
      downloadAllowed: false,
      ...measured,
      measurementNote:
        'Observed wall time through transport and UI on this machine; not a performance guarantee.',
      passed: true,
    });
    await page.close();
  }
  expect(errors).toEqual([]);
  expect(nativeApplicationPosts).toEqual([]);
  // Primary footage is created only after both frameworks pass native inference.
  let raw: string | undefined;
  let phases: RecipePhase[] = [];
  let screenshot: { width: number; height: number } | undefined;
  if (record) {
    const page = await nativeContext.newPage();
    const started = Date.now();
    phases = [];
    await page.goto(`${origin}/react-local-models.html`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.waitForTimeout(700);
    await nativeTrip(page, (text) =>
      phases.push({ seconds: (Date.now() - started) / 1000, text }),
    );
    await page.waitForTimeout(1800);
    const bounds = await page.locator('main').boundingBox();
    if (!bounds || bounds.y + bounds.height > 840)
      throw new Error(
        `Local-model recording overlaps footer: ${JSON.stringify(bounds)}`,
      );
    const frame = resolve(work, 'local-models-frame.png');
    await page.screenshot({ path: frame });
    screenshot = cropRecipeScreenshot(
      frame,
      resolve(assets, 'local-models-result.png'),
      bounds,
    );
    const video = page.video();
    await page.close();
    if (!video) throw new Error('Missing native local-model recording');
    raw = await video.path();
  }
  expect(errors).toEqual([]);
  expect(nativeApplicationPosts).toEqual([]);
  await nativeContext.close();
  nativeContext = undefined;
  if (record && raw) {
    const media = encodeRecipeVideo(
      'local-models',
      raw,
      work,
      assets,
      phases,
      'Select Prepare model for an already available model, then Generate locally for “Three days in Lisbon.” The checked React client uses Hashbrown’s experimental Chrome transport and displays only the settled, validated destination and integer day count. Both React and Angular passed the same real inference task before this recording.',
      `Actual native Chrome inference: ${browserVersion}. Presentation styles added; no API key or narration. Model output can vary. The recorder used a dedicated test profile and started no model download. Separate deterministic LanguageModel shims verify failure and recovery contracts; they are not the primary footage and do not establish Edge or mobile inference support.`,
    );
    shimBrowser = await chromium.launch();
    const page = await shimBrowser.newPage();
    await page.goto(`${origin}/react-local-models.html`);
    for (const extension of ['mp4', 'webm']) {
      const info = await page.evaluate(async (source) => {
        const video = document.createElement('video');
        video.muted = true;
        video.src = source;
        document.body.append(video);
        await new Promise<void>((done, reject) => {
          video.onloadedmetadata = () => done();
          video.onerror = () =>
            reject(new Error('Native recording playback metadata failed'));
        });
        await video.play();
        await new Promise((done) => setTimeout(done, 250));
        const info = {
          width: video.videoWidth,
          height: video.videoHeight,
          currentTime: video.currentTime,
        };
        video.pause();
        video.remove();
        return info;
      }, `${origin}/media/local-models.${extension}`);
      expect(info.width).toBe(1440);
      expect(info.height).toBe(900);
      expect(info.currentTime).toBeGreaterThan(0);
    }
    results.push({
      mode: 'local-models',
      viewport: { width: 1440, height: 900 },
      screenshot,
      playback: ['mp4', 'webm'],
      browserVersion,
      nativeInference: true,
      ...media,
    });
  }
  writeFileSync(
    resolve(work, 'verification.json'),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  const failed = nativeContext
    ?.pages()
    .findLast((page) => page.url() !== 'about:blank');
  if (failed && !failed.isClosed()) {
    await failed.screenshot({ path: resolve(work, 'native-failure.png') });
    writeFileSync(
      resolve(work, 'native-failure.txt'),
      await failed.locator('main').innerText(),
    );
  }
  writeFileSync(
    resolve(work, 'verification-failure.json'),
    JSON.stringify(
      { results, error: error instanceof Error ? error.stack : String(error) },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await nativeContext?.close();
  await shimBrowser?.close();
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
}
