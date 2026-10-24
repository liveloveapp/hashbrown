/** Verifies both real framework clients before recording scripted assisted recipes. */
import { EventType, type RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import type { Decision } from '@hashbrownai/core';
import { chromium, expect } from '@playwright/test';
import express from 'express';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { build } from 'vite';
import {
  demonstrateRecipe,
  type RecipeMode,
  type RecipePhase,
  type RecipeRequest,
  type RecipeScenario,
  verifyRecipe,
} from './docs-recipe-browser';
import {
  createPredictionEvents,
  createRecipeTextEvents,
  createSelectionResponse,
  magicMarkdown,
} from './docs-recipe-fixtures';
import { cropRecipeScreenshot, encodeRecipeVideo } from './docs-recipe-video';

const modes: RecipeMode[] = [
  'magic-text',
  'predictive-suggestions',
  'ui-selection',
];
const requested = process.env['DOCS_DEMO_MODES']?.split(',');
if (requested?.some((mode) => !modes.includes(mode as RecipeMode)))
  throw new Error('Unknown docs recipe mode');
const selected = modes.filter((mode) => !requested || requested.includes(mode));
const record = process.env['DOCS_SKIP_RECORDING'] !== '1';
const work = resolve('dist/docs-recipes');
const compiled = resolve('dist/docs-quickstart/compiled');
const assets = resolve('www/public/video/docs');
mkdirSync(work, { recursive: true });
mkdirSync(assets, { recursive: true });
const css = `
*{box-sizing:border-box}body{margin:0;background:#faf9f0;color:#302820;font:17px/1.4 Arial,sans-serif}
header{height:80px;padding:20px 64px;border-bottom:1px solid #e7dfce;display:flex;justify-content:space-between;align-items:center;font-weight:700}.brand{color:#8a571f;font-size:20px}.tag{font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#786c5e}
main{width:min(920px,calc(100% - 40px));margin:22px auto 80px}h1{font-size:32px;line-height:1.2;letter-spacing:-1px;margin:0 0 16px}h2{font-size:22px;margin:14px 0 7px}p{margin:9px 0}label{display:block;font-size:14px;margin-bottom:5px}input{font:17px Arial;padding:12px;border:1px solid #cbbfa9;background:#fff;border-radius:10px;width:min(580px,100%);margin:0 10px 12px 0}
button{font:600 15px Arial;border:0;border-radius:10px;padding:10px 16px;background:#fbbb52;color:#302820;cursor:pointer;margin:0 7px 6px 0}button:disabled{opacity:.45}nav{display:flex;flex-wrap:wrap;margin:8px 0 10px}ul{padding:12px 24px;margin:0;min-height:56px;border:1px solid #dfd8c8;border-radius:12px;background:#fff}li{padding:3px 0}[role=status]{font-size:15px;color:#695a44;min-height:22px}main>p{font-size:14px;color:#695a44}section[aria-label="Generated reply"],aside,section[aria-label="Summary card"],section[aria-label="Item list"]{padding:15px 24px;border:1px solid #dfd8c8;border-radius:12px;background:#fff;margin:10px 0}a{color:#89500b}aside p{font-size:14px}aside h2{margin:0 0 6px}
footer{position:fixed;bottom:0;width:100%;padding:16px 64px;border-top:1px solid #e7dfce;font-size:12px;color:#786c5e;background:#faf9f0;display:flex;justify-content:space-between;gap:20px}@media(max-width:600px){header,footer{padding:16px 20px}header{height:72px}footer{font-size:10px}h1{font-size:27px}button{padding:10px 12px}main{margin-top:18px}section[aria-label="Generated reply"],aside{padding:12px 16px}}
`;
const components = {
  'magic-text': {
    name: 'MagicTextDemo',
    react: 'MagicTextDemo',
    angular: 'magic-text-demo',
    selector: 'app-magic-text-demo',
  },
  'predictive-suggestions': {
    name: 'PredictiveSuggestions',
    react: 'PredictiveSuggestions',
    angular: 'predictive-suggestions',
    selector: 'app-predictive-suggestions',
  },
  'ui-selection': {
    name: 'UiSelection',
    react: 'UiSelection',
    angular: 'ui-selection',
    selector: 'app-ui-selection',
  },
};
for (const sdk of ['react', 'angular']) {
  for (const mode of selected) {
    const component = components[mode];
    const entry = `${sdk}-${mode}-entry.js`;
    writeFileSync(
      resolve(compiled, `${sdk}-${mode}.html`),
      `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hashbrown ${mode}</title><style>${css}</style><body><header><span class="tag">Hashbrown / assisted interfaces</span><span class="brand">hashbrown</span></header><div id="root"></div><${component.selector}></${component.selector}><footer><span>Explicit requests. Application-owned state.</span><span>Scripted output · presentation styles added · no live model</span></footer><script type="module" src="/${entry}"></script></body></html>`,
    );
    writeFileSync(
      resolve(compiled, entry),
      sdk === 'react'
        ? `import React from'react';import{createRoot}from'react-dom/client';import{HashbrownProvider}from'@hashbrownai/react';import{${component.name}}from'./react/src/${component.react}.js';createRoot(document.getElementById('root')).render(React.createElement(HashbrownProvider,{url:'/api/chat',decision:{url:'/api/decide'},telemetry:false},React.createElement(${component.name})));`
        : `import'@angular/compiler';import{bootstrapApplication}from'@angular/platform-browser';import{provideZonelessChangeDetection}from'@angular/core';import{provideHashbrown}from'@hashbrownai/angular';import{${component.name}}from'./angular/src/app/${component.angular}.js';bootstrapApplication(${component.name},{providers:[provideZonelessChangeDetection(),provideHashbrown({baseUrl:'/api/chat',decision:{url:'/api/decide'},telemetry:false})]}).catch(console.error);`,
    );
  }
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
      input: ['react', 'angular'].flatMap((sdk) =>
        selected.map((mode) => resolve(compiled, `${sdk}-${mode}.html`)),
      ),
    },
  },
});
let scenario: RecipeScenario = {};
let requestCount = 0;
let requests: RecipeRequest[] = [];
let settledCount = 0;
let activeMode: RecipeMode = 'magic-text';
const fixture = {
  configure(next: RecipeScenario) {
    scenario = next;
  },
  count() {
    return requestCount;
  },
  settled() {
    return settledCount;
  },
  latest() {
    return requests.at(-1);
  },
};
const encoder = new EventEncoder();
const app = express();
app.use(express.static(resolve(work, 'browser')));
app.use('/media', express.static(assets));
app.use(express.json());
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
app.post('/api/chat', async (req, res) => {
  const input = req.body as RunAgentInput;
  const next = scenario;
  scenario = {};
  const requestIndex = requests.length;
  requests = [...requests, { kind: 'chat', body: input, textEnded: false }];
  requestCount += 1;
  writeFileSync(
    resolve(work, 'last-request.json'),
    JSON.stringify(requests.at(-1), null, 2),
  );
  try {
    const outcome = next.outcome ?? 'success';
    const events =
      activeMode === 'predictive-suggestions'
        ? createPredictionEvents(input, outcome)
        : createRecipeTextEvents(input, next.text ?? magicMarkdown, outcome);
    if (activeMode === 'predictive-suggestions')
      expect(input.forwardedProps).toMatchObject({
        hashbrown: {
          responseSchema: {
            type: 'object',
            required: ['contextId', 'suggestions'],
            properties: {
              contextId: { type: 'string' },
              suggestions: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['itemId', 'reason'],
                  properties: {
                    itemId: {
                      type: 'string',
                      enum: ['passport', 'charger', 'water', 'sunscreen'],
                    },
                    reason: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      });
    res.writeHead(200, { 'Content-Type': encoder.getContentType() });
    for (const event of events) {
      if (
        event.type === EventType.RUN_FINISHED ||
        event.type === EventType.RUN_ERROR
      )
        await pause(next.delay ?? 600);
      if (res.destroyed) break;
      res.write(encoder.encodeSSE(event));
      if (event.type === EventType.TEXT_MESSAGE_END)
        requests = requests.map((request, index) =>
          index === requestIndex ? { ...request, textEnded: true } : request,
        );
      if (event.type === EventType.TEXT_MESSAGE_CONTENT) await pause(90);
    }
    res.end();
  } catch (error) {
    const message = recordFixtureError(error);
    if (!res.headersSent) res.status(500).json({ error: message });
    else res.end(encoder.encodeSSE({ type: EventType.RUN_ERROR, message }));
  } finally {
    settledCount += 1;
  }
});
app.post('/api/decide', async (req, res) => {
  requests = [
    ...requests,
    { kind: 'decision', body: req.body as Decision.Request, textEnded: false },
  ];
  const next = scenario;
  scenario = {};
  requestCount += 1;
  writeFileSync(
    resolve(work, 'last-request.json'),
    JSON.stringify(requests.at(-1), null, 2),
  );
  try {
    await pause(next.delay ?? 650);
    if (next.outcome === 'failed')
      res.status(503).json({ error: 'Scripted decision unavailable' });
    else
      res.json(
        createSelectionResponse(
          req.body as Decision.Request,
          next.pick ?? 'summary',
          next.confidence ?? 0.95,
        ),
      );
  } catch (error) {
    res.status(500).json({ error: recordFixtureError(error) });
  } finally {
    settledCount += 1;
  }
});

/** Retains transport diagnostics even when a fixture contract fails before streaming. */
function recordFixtureError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  writeFileSync(
    resolve(work, 'fixture-error.json'),
    JSON.stringify({ message, request: requests.at(-1) }, null, 2),
  );
  console.error('Recipe fixture failed:', message);
  return message;
}
const server = createServer(app);
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
if (!address || typeof address === 'string')
  throw new Error('Missing fixture port');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch();
const results: Record<string, unknown>[] = [];
try {
  for (const sdk of ['react', 'angular']) {
    for (const mode of selected) {
      activeMode = mode;
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const initial = requestCount;
      await page.goto(`${origin}/${sdk}-${mode}.html`);
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.waitForTimeout(250);
      expect(requestCount).toBe(initial);
      try {
        await verifyRecipe(page, mode, fixture);
      } catch (error) {
        await page.screenshot({
          path: resolve(work, `${sdk}-${mode}-failure.png`),
        });
        writeFileSync(
          resolve(work, `${sdk}-${mode}-failure.txt`),
          await page.locator('main').innerText(),
        );
        throw error;
      }
      if (errors.length)
        throw new Error(`${sdk}/${mode}: ${errors.join('\n')}`);
      results.push({
        sdk,
        mode,
        desktop: true,
        adverseCases: true,
        recovery: true,
        passed: true,
      });
      await context.close();
      const mobile = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      const mobilePage = await mobile.newPage();
      await mobilePage.goto(`${origin}/${sdk}-${mode}.html`);
      await demonstrateRecipe(mobilePage, mode, fixture);
      expect(
        await mobilePage.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(390);
      await mobilePage.screenshot({
        path: resolve(work, `${sdk}-${mode}-mobile.png`),
      });
      results.push({ sdk, mode, mobile: true, passed: true });
      await mobile.close();
      console.log(`${sdk}/${mode}: desktop, mobile and adverse cases passed`);
    }
  }
  // Both frameworks have passed before any public recording is replaced.
  if (record)
    for (const mode of selected) {
      activeMode = mode;
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        recordVideo: {
          dir: resolve(work, 'raw'),
          size: { width: 1440, height: 900 },
        },
      });
      const page = await context.newPage();
      const recordingStarted = Date.now();
      const phases: RecipePhase[] = [];
      await page.goto(`${origin}/react-${mode}.html`);
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.waitForTimeout(400);
      await demonstrateRecipe(page, mode, fixture, (text) =>
        phases.push({ seconds: (Date.now() - recordingStarted) / 1000, text }),
      );
      await page.waitForTimeout(1200);
      const bounds = await page.locator('main').boundingBox();
      if (!bounds || bounds.y + bounds.height > 842)
        throw new Error(
          `Recording overlaps footer: ${mode} ${JSON.stringify(bounds)}`,
        );
      const frame = resolve(work, `${mode}-frame.png`);
      await page.screenshot({ path: frame });
      const dimensions = cropRecipeScreenshot(
        frame,
        resolve(assets, `${mode}-result.png`),
        bounds,
      );
      const video = page.video();
      await context.close();
      if (!video) throw new Error('Missing browser recording');
      const media = encodeRecipeVideo(
        mode,
        await video.path(),
        work,
        assets,
        phases,
      );
      const playback = await browser.newPage();
      await playback.goto(`${origin}/react-${mode}.html`);
      for (const extension of ['mp4', 'webm']) {
        const mediaInfo = await playback.evaluate(async (source) => {
          const video = document.createElement('video');
          video.muted = true;
          video.src = source;
          document.body.append(video);
          await new Promise<void>((done, reject) => {
            video.onloadedmetadata = () => done();
            video.onerror = () => reject(new Error('Video metadata failed'));
          });
          await video.play();
          await new Promise((done) => setTimeout(done, 250));
          const info = {
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
            currentTime: video.currentTime,
          };
          video.pause();
          video.remove();
          return info;
        }, `${origin}/media/${mode}.${extension}`);
        expect(mediaInfo.currentTime).toBeGreaterThan(0);
        expect(mediaInfo.width).toBe(1440);
        expect(mediaInfo.height).toBe(900);
      }
      await playback.close();
      results.push({
        mode,
        playback: ['mp4', 'webm'],
        recordedSdk: 'react',
        viewport: { width: 1440, height: 900 },
        screenshot: dimensions,
        ...media,
      });
    }
  writeFileSync(
    resolve(work, 'requests.json'),
    JSON.stringify(requests, null, 2),
  );
  writeFileSync(
    resolve(work, 'verification.json'),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
}
