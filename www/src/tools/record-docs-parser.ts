/** Verifies both checked parser clients before recording their actual framework footage. */
import { chromium, expect, type Page } from '@playwright/test';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { build } from 'vite';
import { demonstrateParser, verifyParser } from './docs-parser-browser';
import { createParserCaptions } from './docs-parser-captions';
import {
  createParserEntry,
  createParserTranscript,
  selectParserModes,
} from './docs-parser-fixtures';
import type { RecipePhase } from './docs-recipe-browser';
import { cropRecipeScreenshot, encodeRecipeVideo } from './docs-recipe-video';

const selected = selectParserModes(process.env['DOCS_DEMO_MODES']);
const record = process.env['DOCS_SKIP_RECORDING'] !== '1';
const work = resolve('dist/docs-parser', `${Date.now()}-${randomUUID()}`);
const compiled = resolve('dist/docs-quickstart/compiled');
const assets = resolve('www/public/video/docs');
const clients = selectParserModes();
const viewport = { width: 1440, height: 900 };
mkdirSync(work, { recursive: true });
const css = `*{box-sizing:border-box}body{margin:0;background:#faf9f0;color:#302820;font:17px/1.45 Arial,sans-serif}header{height:76px;padding:20px 64px;border-bottom:1px solid #e7dfce;display:flex;justify-content:space-between;align-items:center}.brand{color:#8a571f;font-size:20px;font-weight:bold}.tag{font-size:12px;letter-spacing:1.4px;text-transform:uppercase}main{width:min(1040px,calc(100% - 40px));margin:24px auto 80px}h1{font-size:30px;line-height:1.2;margin:0 0 14px}h2{font-size:20px;margin:0 0 10px}p{margin:8px 0}label{font-size:14px}select{font:16px Arial;padding:9px;background:white;border:1px solid #cbbfa9;border-radius:8px;margin:0 12px 12px 8px}button{font:600 15px Arial;border:0;border-radius:9px;padding:10px 16px;background:#fbbb52;color:#302820;cursor:pointer;margin:0 7px 10px 0}button:disabled{opacity:.45}[data-testid=parser-status]{font-size:15px;color:#695a44;margin:5px 0 14px}[data-testid=parser-json]{white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.55 monospace;min-height:80px;margin:0}section{min-width:0;border:1px solid #dfd8c8;border-radius:12px;background:#fff;padding:18px;margin:12px 0}[data-testid=parser-preview]{min-height:160px}footer{position:fixed;bottom:0;width:100%;padding:15px 64px;border-top:1px solid #e7dfce;background:#faf9f0;color:#786c5e;font-size:12px;display:flex;justify-content:space-between;gap:20px}@media(min-width:700px){.parser-panels{display:grid;grid-template-columns:1fr 1fr;gap:18px}}@media(max-width:600px){header,footer{padding:16px 20px}header{height:70px}main{margin-top:18px;margin-bottom:24px}h1{font-size:26px}footer{position:static;font-size:10px}select{max-width:100%;margin-left:0}section{padding:14px}}`;
for (const mode of clients) {
  writeFileSync(
    resolve(work, `${mode}-entry.js`),
    createParserEntry(mode, compiled),
  );
  writeFileSync(
    resolve(work, `${mode}.html`),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${mode}</title><style>${css}</style></head><body><header><span class="tag">Hashbrown / streaming JSON parser</span><span class="brand">hashbrown</span></header><div id="root"></div><app-json-parser-demo></app-json-parser-demo><footer><span>Real parser · finite local JSON stream</span><span>Presentation styles added · no live model or weather API</span></footer><script type="module" src="/${mode}-entry.js"></script></body></html>`,
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
const app = express();
app.use(express.static(resolve(work, 'browser')));
app.use('/media', express.static(assets));
const server = createServer(app);
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
if (!address || typeof address === 'string')
  throw new Error('Missing parser fixture port');
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
        video.onerror = () => reject(new Error('Parser video metadata failed'));
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
    const requests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (['fetch', 'xhr'].includes(request.resourceType()))
        requests.push(request.url());
    });
    await page.goto(`${origin}/${mode}.html`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    try {
      await verifyParser(page);
      expect(errors).toEqual([]);
      expect(requests).toEqual([]);
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
    await demonstrateParser(mobilePage);
    expect(
      await mobilePage.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    const mobileMain = await mobilePage.locator('main').boundingBox();
    const mobileFooter = await mobilePage.locator('footer').boundingBox();
    if (!mobileMain || !mobileFooter)
      throw new Error('Missing parser mobile layout bounds');
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
      partialFields: true,
      requiredFieldValues: true,
      adverseCases: true,
      cancellation: true,
      reset: true,
      replacement: true,
      cleanup: true,
      noNetworkSource: true,
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
      await demonstrateParser(page, (text) =>
        phases.push({ seconds: (Date.now() - started) / 1000, text }),
      );
      await page.waitForTimeout(1500);
      const bounds = await page.locator('main').boundingBox();
      if (!bounds || bounds.y + bounds.height > 842)
        throw new Error(
          `Parser recording overlaps footer: ${JSON.stringify(bounds)}`,
        );
      await page.screenshot({ path: resolve(work, `${mode}-frame.png`) });
      const screenshot = cropRecipeScreenshot(
        resolve(work, `${mode}-frame.png`),
        resolve(assets, `${mode}-result.png`),
        bounds,
      );
      const video = page.video();
      await context.close();
      if (!video) throw new Error('Missing parser browser recording');
      const transcript = createParserTranscript(mode);
      const media = encodeRecipeVideo(
        mode,
        await video.path(),
        work,
        assets,
        phases,
        transcript,
        'Finite local JSON stream; no live model or weather API.',
      );
      // The shared legacy encoder defaults to React; this companion names the actual capture.
      writeFileSync(resolve(assets, `${mode}-transcript.txt`), transcript);
      writeFileSync(
        resolve(assets, `${mode}.vtt`),
        createParserCaptions(phases, media.duration),
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
