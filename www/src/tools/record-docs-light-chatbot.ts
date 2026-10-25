/** Verifies both checked UI chatbot clients before recording their actual framework footage. */
import { EventType, type RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { chromium, expect, type Page } from '@playwright/test';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { build } from 'vite';
import {
  demonstrateLightChatbot,
  verifyLightChatbot,
} from './docs-light-chatbot-browser';
import {
  createLightChatbotCaptions,
  createLightChatbotEntry,
  createLightChatbotEvents,
  createLightChatbotTranscript,
  type LightChatbotOutcome,
  selectLightChatbotModes,
} from './docs-light-chatbot-fixtures';
import type { RecipePhase } from './docs-recipe-browser';
import { cropRecipeScreenshot, encodeRecipeVideo } from './docs-recipe-video';

const selected = selectLightChatbotModes(process.env['DOCS_DEMO_MODES']);
const record = process.env['DOCS_SKIP_RECORDING'] !== '1';
const work = resolve('dist/docs-ui-chatbot', `${Date.now()}-${randomUUID()}`);
const compiled = resolve('dist/docs-quickstart/compiled');
const assets = resolve('www/public/video/docs');
const clients = selectLightChatbotModes();
const viewport = { width: 1440, height: 900 };
mkdirSync(work, { recursive: true });
const css = `*{box-sizing:border-box}body{margin:0;background:#faf9f0;color:#302820;font:17px/1.45 Arial,sans-serif}header{height:76px;padding:20px 64px;border-bottom:1px solid #e7dfce;display:flex;justify-content:space-between;align-items:center}.brand{color:#8a571f;font-size:20px;font-weight:bold}.tag{font-size:12px;letter-spacing:1.4px;text-transform:uppercase}main{width:min(980px,calc(100% - 40px));margin:22px auto 82px}h1{font-size:30px;line-height:1.2;margin:0 0 12px}h2{font-size:20px;margin:0 0 8px}p{margin:8px 0}label{display:block;font-size:14px}textarea,input{font:16px Arial;padding:10px;background:white;border:1px solid #cbbfa9;border-radius:8px;width:100%;margin:6px 0 12px}textarea{height:58px;resize:none}button{font:600 15px Arial;border:0;border-radius:9px;padding:10px 16px;background:#fbbb52;color:#302820;cursor:pointer;margin:0 7px 8px 0}button:disabled{opacity:.45}section,article{min-width:0;border:1px solid #dfd8c8;border-radius:12px;background:#fff;padding:12px 18px;margin:10px 0}article p{margin:4px 0}[data-testid=chat-status],[data-testid=proposal-status]{font-size:14px;color:#695a44}ul,ol{list-style:none;padding:0;margin:0}footer{position:fixed;bottom:0;width:100%;padding:15px 64px;border-top:1px solid #e7dfce;background:#faf9f0;color:#786c5e;font-size:12px;display:flex;justify-content:space-between;gap:20px}@media(max-width:600px){header,footer{padding:16px 20px}header{height:70px}main{margin-top:18px;margin-bottom:24px}h1{font-size:26px}footer{position:static;font-size:10px}section,article{padding:12px}}`;
for (const mode of clients) {
  writeFileSync(
    resolve(work, `${mode}-entry.js`),
    createLightChatbotEntry(mode, compiled),
  );
  writeFileSync(
    resolve(work, `${mode}.html`),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${mode}</title><style>${css}</style></head><body><header><span class="tag">Hashbrown / generative UI chatbot</span><span class="brand">hashbrown</span></header><div id="root"></div><app-light-chatbot></app-light-chatbot><footer><span>Real SDK · browser tools · local simulated light</span><span>Scripted HTTP AG-UI · no live model or real device</span></footer><script type="module" src="/${mode}-entry.js"></script></body></html>`,
  );
}
await build({
  configFile: false,
  root: work,
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
      input: clients.map((mode) => resolve(work, `${mode}.html`)),
    },
  },
});
const requests: RunAgentInput[] = [];
let nextOutcome: LightChatbotOutcome = 'success';
let settled = 0;
const scenarios = new Map<string, LightChatbotOutcome>();
let nextTerminalGate: Promise<void> | undefined;
const terminalGates = new Map<string, Promise<void>>();
const encoder = new EventEncoder();
const fixture = {
  configure(outcome: LightChatbotOutcome) {
    nextOutcome = outcome;
  },
  requests: () => requests,
  settled: () => settled,
  holdNextTerminal() {
    let release: () => void = () => undefined;
    nextTerminalGate = new Promise<void>((done) => {
      release = done;
    });
    return release;
  },
};
const app = express();
app.use(express.static(resolve(work, 'browser')));
app.use(express.json());
app.post('/api/chat', async (req, res) => {
  const input = req.body as RunAgentInput;
  const messageId = [...input.messages]
    .reverse()
    .find((message) => message.role === 'user')?.id;
  const userId = messageId ? `${input.threadId}:${messageId}` : undefined;
  if (!userId) throw new Error('Missing plain user message');
  if (!scenarios.has(userId)) {
    scenarios.set(userId, nextOutcome);
    nextOutcome = 'success';
    if (nextTerminalGate) {
      terminalGates.set(userId, nextTerminalGate);
      nextTerminalGate = undefined;
    }
  }
  const outcome = scenarios.get(userId) ?? 'success';
  requests.push(input);
  res.writeHead(200, { 'Content-Type': encoder.getContentType() });
  try {
    const events = createLightChatbotEvents(input, outcome);
    const rendersUi = events.some(
      (event) => event.type === EventType.TEXT_MESSAGE_CONTENT,
    );
    for (const event of events) {
      if (
        rendersUi &&
        (event.type === EventType.RUN_FINISHED ||
          event.type === EventType.RUN_ERROR)
      )
        await terminalGates.get(userId);
      if (
        event.type === EventType.RUN_FINISHED ||
        event.type === EventType.RUN_ERROR
      )
        await new Promise((done) => setTimeout(done, 650));
      if (!res.destroyed) res.write(encoder.encodeSSE(event));
      if (event.type === EventType.TEXT_MESSAGE_CONTENT)
        await new Promise((done) => setTimeout(done, 250));
    }
  } finally {
    settled++;
    res.end();
  }
});
app.use('/media', express.static(assets));
const server = createServer(app);
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
if (!address || typeof address === 'string')
  throw new Error('Missing chatbot fixture port');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch();
const results: Record<string, unknown>[] = [];

/** Confirms encoded media can play at the dimensions advertised by the docs. */
async function verifyPlayback(page: Page, mode: string): Promise<void> {
  for (const extension of ['mp4', 'webm']) {
    const measured = await page.evaluate(async (source) => {
      const video = document.createElement('video');
      video.muted = true;
      video.src = source;
      document.body.append(video);
      await new Promise<void>((done, reject) => {
        video.onloadedmetadata = () => done();
        video.onerror = () =>
          reject(new Error('Chatbot video metadata failed'));
      });
      await video.play();
      await new Promise((done) => setTimeout(done, 250));
      const result = {
        width: video.videoWidth,
        height: video.videoHeight,
        time: video.currentTime,
      };
      video.pause();
      video.remove();
      return result;
    }, `${origin}/media/${mode}.${extension}`);
    expect(measured).toMatchObject(viewport);
    expect(measured.time).toBeGreaterThan(0);
  }
}

try {
  for (const mode of clients) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors: string[] = [];
    const network: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (['fetch', 'xhr'].includes(request.resourceType()))
        network.push(request.url());
    });
    await page.goto(`${origin}/${mode}.html`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    try {
      await verifyLightChatbot(page, fixture);
      expect(errors).toEqual([]);
      expect(network.every((url) => url === `${origin}/api/chat`)).toBe(true);
    } catch (error) {
      await page.screenshot({ path: resolve(work, `${mode}-failure.png`) });
      writeFileSync(
        resolve(work, `${mode}-failure.txt`),
        await page.locator('body').innerText(),
      );
      throw error;
    }
    await context.close();
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const mobilePage = await mobile.newPage();
    await mobilePage.goto(`${origin}/${mode}.html`);
    await demonstrateLightChatbot(mobilePage, fixture);
    expect(
      await mobilePage.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    const mobileMain = await mobilePage.locator('main').boundingBox();
    const mobileFooter = await mobilePage.locator('footer').boundingBox();
    if (!mobileMain || !mobileFooter)
      throw new Error('Missing chatbot mobile layout bounds');
    expect(mobileFooter.y).toBeGreaterThanOrEqual(
      mobileMain.y + mobileMain.height,
    );
    await mobilePage.screenshot({
      path: resolve(work, `${mode}-mobile.png`),
      fullPage: true,
    });
    await mobile.close();
    results.push({
      mode,
      desktop: true,
      mobile: true,
      browserToolContinuation: true,
      updatedFollowup: true,
      adverseCases: true,
      cancellation: true,
      onceAndRevisionGate: true,
      replacement: true,
      cleanup: true,
      scriptedHttpTransport: true,
      passed: true,
    });
  }
  // Both actual clients have passed before any public asset is replaced.
  if (record) {
    mkdirSync(assets, { recursive: true });
    for (const mode of selected) {
      const context = await browser.newContext({
        viewport,
        recordVideo: { dir: resolve(work, 'raw'), size: viewport },
      });
      const page = await context.newPage();
      const phases: RecipePhase[] = [];
      const started = Date.now();
      await page.goto(`${origin}/${mode}.html`);
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.waitForTimeout(400);
      await demonstrateLightChatbot(page, fixture, (text) =>
        phases.push({ seconds: (Date.now() - started) / 1000, text }),
      );
      await page.waitForTimeout(1500);
      const bounds = await page.locator('main').boundingBox();
      if (!bounds || bounds.y + bounds.height > 842)
        throw new Error(
          `Chatbot recording overlaps footer: ${JSON.stringify(bounds)}`,
        );
      await page.screenshot({ path: resolve(work, `${mode}-frame.png`) });
      const screenshot = cropRecipeScreenshot(
        resolve(work, `${mode}-frame.png`),
        resolve(assets, `${mode}-result.png`),
        bounds,
      );
      const video = page.video();
      await context.close();
      if (!video) throw new Error('Missing chatbot browser recording');
      const transcript = createLightChatbotTranscript(mode);
      const media = encodeRecipeVideo(
        mode,
        await video.path(),
        work,
        assets,
        phases,
        transcript,
        'Scripted AG-UI at the HTTP transport boundary; real browser tool handler; no live model or real device.',
      );
      // The shared legacy encoder defaults to React; this companion names the actual capture.
      writeFileSync(resolve(assets, `${mode}-transcript.txt`), transcript);
      writeFileSync(
        resolve(assets, `${mode}.vtt`),
        createLightChatbotCaptions(phases, media.duration),
      );
      const playback = await browser.newPage();
      await playback.goto(`${origin}/${mode}.html`);
      await verifyPlayback(playback, mode);
      await playback.close();
      results.push({
        mode,
        recordedSdk: mode.endsWith('angular') ? 'angular' : 'react',
        viewport,
        screenshot,
        playback: ['mp4', 'webm'],
        ...media,
      });
    }
  }
  writeFileSync(
    resolve(work, 'requests.json'),
    JSON.stringify(requests, null, 2),
  );
  writeFileSync(
    resolve(work, 'verification.json'),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify({ work, results }, null, 2));
} finally {
  await browser.close();
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
}
