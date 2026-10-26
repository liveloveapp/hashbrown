/** Verifies actual agent clients and records checked server routing with classifier fixtures. */
import { chromium, expect, type Page } from '@playwright/test';
import express from 'express';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import {
  type AgentMode,
  createAgentEnvelope,
  selectAgentModes,
} from './docs-agent-decisions-fixtures';
import type { RecipePhase } from './docs-recipe-browser';
import { cropRecipeScreenshot, encodeRecipeVideo } from './docs-recipe-video';

const selected = selectAgentModes(process.env['DOCS_DEMO_MODES']);
const record = process.env['DOCS_SKIP_RECORDING'] !== '1';
const work = resolve('dist/docs-agent-decisions');
const compiled = resolve('dist/docs-quickstart/compiled');
const assets = resolve('www/public/video/docs');
mkdirSync(work, { recursive: true });
mkdirSync(assets, { recursive: true });
const alias = Object.fromEntries(
  ['core', 'react', 'angular', 'typesafe'].map((pkg) => [
    `@hashbrownai/${pkg}`,
    resolve(`dist/packages/${pkg}`),
  ]),
);
const css = `*{box-sizing:border-box}body{margin:0;background:#faf9f0;color:#302820;font:18px/1.5 Arial,sans-serif}header{height:88px;padding:24px 64px;border-bottom:1px solid #e7dfce;display:flex;justify-content:space-between;align-items:center}.tag{font-size:12px;letter-spacing:1.5px;text-transform:uppercase}.brand{font-size:22px;color:#8a571f;font-weight:bold}main{width:min(920px,calc(100% - 40px));margin:30px auto 100px}h1{font-size:34px;line-height:1.2;margin:0 0 20px}h2{font-size:21px;margin:12px 0}label{display:block;font-size:15px;margin-bottom:7px}textarea{display:block;width:100%;height:115px;padding:16px;border:1px solid #cbbfa9;border-radius:10px;font:18px/1.5 Arial,sans-serif;background:#fff;resize:none;margin-bottom:15px}button{font:600 16px Arial;border:0;border-radius:10px;padding:12px 18px;background:#fbbb52;color:#302820;margin-right:8px;cursor:pointer}button:disabled{opacity:.45}[role=status]{font-size:15px;color:#695a44;min-height:28px;margin:15px 0}section[aria-label="Agent reply"]{border:1px solid #dfd8c8;border-radius:12px;padding:20px 24px;background:#fff;min-height:145px;overflow-wrap:anywhere}footer{position:fixed;bottom:0;width:100%;padding:17px 64px;border-top:1px solid #e7dfce;background:#faf9f0;color:#786c5e;font-size:12px;display:flex;justify-content:space-between;gap:20px}@media(max-width:600px){header,footer{padding:16px 20px}header{height:72px}main{margin-top:20px}h1{font-size:28px}footer{font-size:10px}section[aria-label="Agent reply"]{padding:14px 16px}}`;
for (const sdk of ['react', 'angular']) {
  writeFileSync(
    resolve(compiled, `${sdk}-agent.html`),
    `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hashbrown server agent</title><style>${css}</style><body><header><span class="tag">Hashbrown / decisions in agents</span><span class="brand">hashbrown</span></header><div id="root"></div><app-agent-decisions></app-agent-decisions><footer><span>Server-owned routes. Read-only example handlers.</span><span>Scripted classifier · presentation styles added · no live model</span></footer><script type="module" src="/${sdk}-agent-entry.js"></script></body></html>`,
  );
  writeFileSync(
    resolve(compiled, `${sdk}-agent-entry.js`),
    sdk === 'react'
      ? `import React from'react';import{createRoot}from'react-dom/client';import{HashbrownProvider}from'@hashbrownai/react';import{AgentDecisions}from'./react/src/AgentDecisions.js';createRoot(document.getElementById('root')).render(React.createElement(HashbrownProvider,{url:'/api/agent',telemetry:false},React.createElement(AgentDecisions)));`
      : `import'@angular/compiler';import{bootstrapApplication}from'@angular/platform-browser';import{provideZonelessChangeDetection}from'@angular/core';import{provideHashbrown}from'@hashbrownai/angular';import{AgentDecisions}from'./angular/src/app/agent-decisions.js';bootstrapApplication(AgentDecisions,{providers:[provideZonelessChangeDetection(),provideHashbrown({baseUrl:'/api/agent',telemetry:false})]}).catch(console.error);`,
  );
}
await build({
  configFile: false,
  root: compiled,
  resolve: { alias },
  build: {
    outDir: resolve(work, 'browser'),
    emptyOutDir: true,
    rollupOptions: {
      input: ['react', 'angular'].map((sdk) =>
        resolve(compiled, `${sdk}-agent.html`),
      ),
    },
  },
});
// Bundle package ESM and the checked app together: tsx's CJS source resolution
// cannot execute the core package's development-install subpath import.
writeFileSync(
  resolve(work, 'runtime-entry.ts'),
  `export {createAgentApp} from ${JSON.stringify(resolve('www/examples/quickstart/server/agent-app.ts'))};export {DecisionError} from '@hashbrownai/typesafe';`,
);
await build({
  configFile: false,
  resolve: { alias },
  ssr: { noExternal: ['@hashbrownai/core', '@hashbrownai/typesafe'] },
  build: {
    ssr: resolve(work, 'runtime-entry.ts'),
    outDir: resolve(work, 'runtime'),
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'agent.mjs' } },
  },
});
const { createAgentApp, DecisionError } = await import(
  pathToFileURL(resolve(work, 'runtime/agent.mjs')).href
);
type Scenario = {
  route?: 'order' | 'returns' | 'clarify';
  confidence?: number;
  outcome?: 'expected' | 'unexpected' | 'malformed';
  delay?: number;
};
let scenario: Scenario = {};
let count = 0;
let transportCount = 0;
let settled = 0;
let aborted = 0;
let requests: unknown[] = [];
const outer = express();
outer.use(express.static(resolve(work, 'browser')));
outer.use('/media', express.static(assets));
outer.use('/api/agent', (_req, _res, next) => {
  transportCount += 1;
  next();
});
outer.use(
  createAgentApp({
    classify: async ({
      request,
      signal,
    }: {
      request: { state: string };
      signal: AbortSignal;
    }) => {
      const next = scenario;
      scenario = {};
      count += 1;
      requests = [...requests, { request, scenario: next }];
      try {
        // Deliberately ignore cancellation while delayed: the actual router must
        // check the signal again before invoking an application handler.
        await new Promise((done) => setTimeout(done, next.delay ?? 650));
        if (signal.aborted) aborted += 1;
        if (next.outcome === 'expected')
          throw new DecisionError(
            'upstream',
            503,
            'Scripted classifier unavailable',
          );
        if (next.outcome === 'unexpected')
          throw new TypeError('Scripted programming failure');
        if (next.outcome === 'malformed') return { kind: 'invalid' };
        return createAgentEnvelope(
          next.route ?? 'order',
          next.confidence ?? 0.95,
        );
      } finally {
        settled += 1;
      }
    },
  }),
);
const server = createServer(outer);
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
if (!address || typeof address === 'string')
  throw new Error('Missing agent fixture port');
const origin = `http://127.0.0.1:${address.port}`;
const runButton = (page: Page) =>
  page.getByRole('button', { name: 'Run agent', exact: true });
const reply = (page: Page) =>
  page.getByRole('region', { name: 'Agent reply', exact: true });
async function run(page: Page, text: string, next: Scenario = {}) {
  await page.getByLabel('Customer message', { exact: true }).fill(text);
  const before = count;
  scenario = next;
  await runButton(page).click();
  await expect.poll(() => count).toBe(before + 1);
  expect(requests.at(-1)).toMatchObject({ request: { state: text } });
}
async function ready(page: Page) {
  await expect(runButton(page)).toBeEnabled();
}
async function demonstrate(
  page: Page,
  mode: AgentMode,
  phase: (text: string) => void = () => undefined,
) {
  if (mode === 'agent-routing') {
    phase('Run an order question through the server-owned router.');
    await run(page, 'Where is order HB-1042?');
    await expect(reply(page)).toContainText('has shipped');
    await ready(page);
    await page.waitForTimeout(1200);
    phase('The order handler returns fixed public example data.');
    await page.waitForTimeout(900);
    phase('Ask about returns. The server selects its other read-only handler.');
    await run(page, 'What is your returns policy?', { route: 'returns' });
    await expect(reply(page)).toContainText('within 30 days');
    await ready(page);
    phase('The application-owned returns policy appears.');
  } else {
    phase('An uncertain decision asks for clarification.');
    await run(page, 'Can you help me?', { confidence: 0.4 });
    await expect(reply(page)).toContainText('Please clarify');
    await ready(page);
    await page.waitForTimeout(1200);
    phase('An expected classifier failure uses the same safe clarification.');
    await run(page, 'Where is order HB-1042?', { outcome: 'expected' });
    await expect(reply(page)).toContainText('Please clarify');
    await ready(page);
    await page.waitForTimeout(1200);
    phase('An unexpected failure ends the run and offers an explicit retry.');
    await run(page, 'Where is order HB-1042?', { outcome: 'unexpected' });
    await expect(page.getByRole('status')).toContainText(
      /could not|failed|retry/i,
    );
    await ready(page);
    await page.waitForTimeout(1400);
    phase('Choose Run agent to retry the order question.');
    await run(page, 'Where is order HB-1042?');
    await expect(reply(page)).toContainText('has shipped');
    await ready(page);
    phase('The explicit retry succeeds.');
  }
}
async function verify(page: Page) {
  await demonstrate(page, 'agent-routing');
  for (const next of [
    { route: 'clarify' as const },
    { confidence: 0.4 },
    { confidence: 1.2 },
    { confidence: -0.1 },
    { outcome: 'expected' as const },
    { outcome: 'malformed' as const },
  ]) {
    await run(page, 'Where is order HB-1042?', next);
    await expect(reply(page)).toContainText('Please clarify');
    await ready(page);
  }
  for (const text of ['Where is my order?', 'Where is order HB-9999?']) {
    await run(page, text);
    await expect(reply(page)).toContainText('Please clarify');
    await ready(page);
  }
  await demonstrate(page, 'agent-fallback');
  const abortedBefore = aborted;
  const settledBefore = settled;
  await run(page, 'Where is order HB-1042?', { delay: 1700 });
  await expect(reply(page)).not.toContainText('has shipped');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(/stopped/i);
  await ready(page);
  await run(page, 'What is your returns policy?', { route: 'returns' });
  await expect(reply(page)).toContainText('within 30 days');
  await ready(page);
  await expect.poll(() => settled).toBe(settledBefore + 2);
  expect(aborted).toBe(abortedBefore + 1);
  await expect(reply(page)).not.toContainText('has shipped');
  await expect(reply(page)).not.toContainText('Please clarify');
}
const browser = await chromium.launch();
const results: Record<string, unknown>[] = [];
try {
  for (const sdk of ['react', 'angular']) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const before = transportCount;
    await page.goto(`${origin}/${sdk}-agent.html`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.waitForTimeout(350);
    expect(transportCount).toBe(before);
    try {
      await verify(page);
    } catch (error) {
      await page.screenshot({ path: resolve(work, `${sdk}-failure.png`) });
      writeFileSync(
        resolve(work, `${sdk}-failure.txt`),
        await page.locator('main').innerText(),
      );
      throw error;
    }
    expect(errors).toEqual([]);
    results.push({
      sdk,
      desktop: true,
      noInitialRequest: true,
      routes: true,
      clarification: true,
      cancellationBeforeHandler: true,
      staleResponse: true,
      recovery: true,
      passed: true,
    });
    await context.close();
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const mobilePage = await mobile.newPage();
    await mobilePage.goto(`${origin}/${sdk}-agent.html`);
    await demonstrate(mobilePage, 'agent-routing');
    expect(
      await mobilePage.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await mobilePage.screenshot({ path: resolve(work, `${sdk}-mobile.png`) });
    results.push({ sdk, mobile: true, passed: true });
    await mobile.close();
    console.log(
      `${sdk}: actual agent routing, fallback, recovery and mobile passed`,
    );
  }
  // Public assets are replaced only after both real framework clients pass.
  if (record)
    for (const mode of selected) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        recordVideo: {
          dir: resolve(work, 'raw'),
          size: { width: 1440, height: 900 },
        },
      });
      const page = await context.newPage();
      const started = Date.now();
      const phases: RecipePhase[] = [];
      await page.goto(`${origin}/react-agent.html`);
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.waitForTimeout(500);
      await demonstrate(page, mode, (text) =>
        phases.push({ seconds: (Date.now() - started) / 1000, text }),
      );
      await page.waitForTimeout(1500);
      const bounds = await page.locator('main').boundingBox();
      if (!bounds || bounds.y + bounds.height > 840)
        throw new Error(
          `Agent recording overlaps footer: ${JSON.stringify(bounds)}`,
        );
      const frame = resolve(work, `${mode}-frame.png`);
      await page.screenshot({ path: frame });
      const screenshot = cropRecipeScreenshot(
        frame,
        resolve(assets, `${mode}-result.png`),
        bounds,
      );
      const video = page.video();
      await context.close();
      if (!video) throw new Error('Missing agent recording');
      const media = encodeRecipeVideo(
        mode,
        await video.path(),
        work,
        assets,
        phases,
        mode === 'agent-routing'
          ? 'Run an order question, inspect the public example delivery reply, then ask about returns and inspect the fixed returns policy. The server pins the decision schema and runs read-only application handlers.'
          : 'An uncertain classifier result asks for clarification. An expected provider failure uses the same safe reply. An unexpected programming failure ends the run; choose Run agent explicitly to retry successfully.',
        'Checked Express agent/router with scripted classifier envelopes and errors; presentation styles added; no live model or narration. Final replies come from the checked application handlers. Client state clears on refresh.',
      );
      const playback = await browser.newPage();
      await playback.goto(`${origin}/react-agent.html`);
      for (const extension of ['mp4', 'webm']) {
        const info = await playback.evaluate(async (source) => {
          const element = document.createElement('video');
          element.muted = true;
          element.src = source;
          document.body.append(element);
          await new Promise<void>((done, reject) => {
            element.onloadedmetadata = () => done();
            element.onerror = () =>
              reject(new Error('Agent video metadata failed'));
          });
          await element.play();
          await new Promise((done) => setTimeout(done, 250));
          const measured = {
            width: element.videoWidth,
            height: element.videoHeight,
            currentTime: element.currentTime,
            duration: element.duration,
          };
          element.pause();
          element.remove();
          return measured;
        }, `${origin}/media/${mode}.${extension}`);
        expect(info.currentTime).toBeGreaterThan(0);
        expect(info.width).toBe(1440);
        expect(info.height).toBe(900);
      }
      await playback.close();
      results.push({
        mode,
        recordedSdk: 'react',
        viewport: { width: 1440, height: 900 },
        screenshot,
        playback: ['mp4', 'webm'],
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
