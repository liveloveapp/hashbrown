/** Records checked typed-list clients with scripted AG-UI events and ffmpeg. */
import { EventType, type RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { chromium, expect, type Page } from '@playwright/test';
import express from 'express';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { build } from 'vite';
import {
  createStructuredListEvents,
  type StructuredListOutcome,
} from './docs-structured-fixtures';

const modes = ['structured-form', 'streaming-data'] as const;
const requested = process.env['DOCS_DEMO_MODES']?.split(',');
if (requested?.some((mode) => !modes.includes(mode as (typeof modes)[number])))
  throw new Error('Unknown structured demo mode');
const selected = modes.filter((mode) => !requested || requested.includes(mode));
const record = process.env['DOCS_SKIP_RECORDING'] !== '1';
const work = resolve('dist/docs-structured');
const compiled = resolve('dist/docs-quickstart/compiled');
const assets = resolve('www/public/video/docs');
mkdirSync(work, { recursive: true });
const css = `
*{box-sizing:border-box}body{margin:0;background:#faf9f0;color:#302820;font:17px/1.4 Arial,sans-serif}
header{height:92px;padding:24px 64px;border-bottom:1px solid #e7dfce;display:flex;justify-content:space-between;align-items:center;font-weight:700}.brand{color:#8a571f;font-size:20px}.tag{font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#786c5e}
main{width:920px;margin:22px auto}h1{font-size:32px;line-height:1.2;letter-spacing:-1px;margin:0 0 16px}h2{font-size:21px;margin:16px 0 5px}p{margin:9px 0}label{display:block;font-size:14px;margin-bottom:5px}textarea{font:17px Arial;padding:12px;border:1px solid #cbbfa9;background:#fff;border-radius:10px;width:100%;height:62px;resize:none;margin-bottom:12px}
button{font:600 15px Arial;border:0;border-radius:10px;padding:12px 18px;background:#fbbb52;color:#302820;cursor:pointer;margin-right:8px}button:disabled{opacity:.45}nav{display:flex;margin-bottom:12px}ul{list-style:none;padding:12px 20px;margin:0;min-height:78px;border:1px solid #dfd8c8;border-radius:12px;background:#fff}li{padding:3px 0}[role=status]{font-size:15px;color:#695a44;min-height:22px}main>p{font-size:14px;color:#695a44}
footer{position:fixed;bottom:0;width:100%;padding:17px 64px;border-top:1px solid #e7dfce;font-size:12px;color:#786c5e;background:#faf9f0;display:flex;justify-content:space-between}#phase{font-weight:700;color:#40352b}
`;
for (const sdk of ['react', 'angular'])
  writeFileSync(
    resolve(compiled, `${sdk}-structured.html`),
    `<!doctype html><html><meta charset="utf-8"><title>Hashbrown structured list example</title><style>${css}</style><body><header><span class="tag">Hashbrown / typed data</span><span class="brand">hashbrown</span></header><div id="root"></div><app-structured-list></app-structured-list><footer><span id="phase">Generate a draft. Review it. Apply it.</span><span>Scripted AG-UI output · presentation styles added · no narration</span></footer><script type="module" src="/${sdk}-structured-entry.js"></script></body></html>`,
  );
writeFileSync(
  resolve(compiled, 'react-structured-entry.js'),
  `import React from'react';import{createRoot}from'react-dom/client';import{HashbrownProvider}from'@hashbrownai/react';import{StructuredList}from'./react/src/StructuredList.js';createRoot(document.getElementById('root')).render(React.createElement(HashbrownProvider,{url:'/api/chat',telemetry:false},React.createElement(StructuredList)));`,
);
writeFileSync(
  resolve(compiled, 'angular-structured-entry.js'),
  `import'@angular/compiler';import{bootstrapApplication}from'@angular/platform-browser';import{provideZonelessChangeDetection}from'@angular/core';import{provideHashbrown}from'@hashbrownai/angular';import{StructuredList}from'./angular/src/app/structured-list.js';bootstrapApplication(StructuredList,{providers:[provideZonelessChangeDetection(),provideHashbrown({baseUrl:'/api/chat',telemetry:false})]}).catch(console.error);`,
);
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
        resolve(compiled, `${sdk}-structured.html`),
      ),
    },
  },
});
let nextOutcome: StructuredListOutcome = 'success';
let terminalPause = 1_000;
const requests: RunAgentInput[] = [];
const encoder = new EventEncoder();
const app = express();
app.use(express.static(resolve(work, 'browser')));
app.use(express.json());
app.post('/api/chat', async (req, res) => {
  const input = req.body as RunAgentInput;
  const outcome = nextOutcome;
  const pause = terminalPause;
  nextOutcome = 'success';
  requests.push(input);
  res.writeHead(200, { 'Content-Type': encoder.getContentType() });
  for (const event of createStructuredListEvents(input, outcome)) {
    if (res.destroyed) break;
    if (
      event.type === EventType.RUN_FINISHED ||
      event.type === EventType.RUN_ERROR
    )
      await new Promise((done) => setTimeout(done, pause));
    if (res.destroyed) break;
    res.write(encoder.encodeSSE(event));
    if (event.type === EventType.TEXT_MESSAGE_CONTENT)
      await new Promise((done) => setTimeout(done, 550));
  }
  res.end();
});
const server = createServer(app);
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
if (!address || typeof address === 'string')
  throw new Error('Missing fixture port');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch();
const results: Record<string, unknown>[] = [];

async function generate(
  page: Page,
  outcome: StructuredListOutcome = 'success',
) {
  const before = requests.length;
  nextOutcome = outcome;
  await page
    .getByRole('button', { name: 'Generate draft', exact: true })
    .click();
  // Observe start before waiting for idle; an old enabled button must not
  // satisfy the idle assertion before the new run reaches the DOM.
  await expect.poll(() => requests.length).toBe(before + 1);
  await expect(
    page.getByRole('button', { name: 'Generate draft', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Apply list', exact: true }),
  ).toBeDisabled();
}
async function ready(page: Page) {
  await expect(
    page.getByRole('button', { name: 'Apply list', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByTestId('draft-list').getByRole('listitem'),
  ).toHaveCount(2);
}
function encode(id: string, raw: string) {
  const master = resolve(work, `${id}-master.mp4`);
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loop',
      '1',
      '-t',
      '2',
      '-i',
      resolve(work, `${id}-frame.png`),
      '-i',
      raw,
      '-filter_complex',
      '[0:v]fps=30,setpts=PTS-STARTPTS,setsar=1[a];[1:v]fps=30,setpts=PTS-STARTPTS,setsar=1,tpad=stop_mode=clone:stop_duration=1.5[b];[a][b]concat=n=2:v=1:a=0,format=yuv420p[v]',
      '-map',
      '[v]',
      '-an',
      '-c:v',
      'libx264',
      '-crf',
      '18',
      master,
    ],
    { stdio: 'ignore' },
  );
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      master,
      '-c:v',
      'libx264',
      '-crf',
      '23',
      '-preset',
      'slow',
      '-movflags',
      '+faststart',
      resolve(assets, `${id}.mp4`),
    ],
    { stdio: 'ignore' },
  );
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      master,
      '-c:v',
      'libvpx-vp9',
      '-crf',
      '32',
      '-b:v',
      '0',
      '-cpu-used',
      '4',
      '-row-mt',
      '1',
      resolve(assets, `${id}.webm`),
    ],
    { stdio: 'ignore' },
  );
  execFileSync(
    'ffmpeg',
    ['-y', '-i', master, '-frames:v', '1', resolve(assets, `${id}-poster.png`)],
    { stdio: 'ignore' },
  );
  const duration = Number(
    execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'csv=p=0',
        master,
      ],
      { encoding: 'utf8' },
    ).trim(),
  );
  const stamp = (seconds: number) =>
    new Date(seconds * 1000).toISOString().slice(11, 23);
  const middle =
    id === 'streaming-data'
      ? 'Generate a draft. Complete items appear progressively; Apply list stays disabled until the run finishes.'
      : 'Generate a typed shopping-list draft from two apples and one loaf of bread. Review the completed items.';
  writeFileSync(
    resolve(assets, `${id}.vtt`),
    `WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nPreview: a reviewed shopping list applied to local state.\n\n00:00:02.000 --> ${stamp(duration - 2)}\n${middle}\n\n${stamp(duration - 2)} --> ${stamp(duration)}\nApply list explicitly copies the validated draft into the separate applied list.\n`,
  );
  writeFileSync(
    resolve(assets, `${id}-transcript.txt`),
    `Shopping list demo\n\nRecorded through the checked React component; Angular verified for the same behavior. Scripted AG-UI output, presentation styles added, no live model, narration, purchase or server write.\n\nThe first two seconds preview the final result. The full interaction follows.\n\n${middle}\n\nThe draft displays 2 × Apples and 1 × Bread. Generated items never apply automatically. After successful completion and application validation, select Apply list. The applied list now contains an independent copy. It lives only in the component and clears on refresh. Cancelled or failed runs cannot replace it.\n`,
  );
}
try {
  for (const sdk of ['react', 'angular']) {
    for (const mode of selected) {
      const capture = record && sdk === 'react';
      const context = await browser.newContext({
        viewport: { width: 1440, height: 810 },
        ...(capture
          ? {
              recordVideo: {
                dir: resolve(work, 'raw'),
                size: { width: 1440, height: 810 },
              },
            }
          : {}),
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${origin}/${sdk}-structured.html`);
      await page.getByRole('heading', { level: 1 }).waitFor();
      terminalPause = mode === 'streaming-data' ? 2_000 : 1_000;
      if (mode === 'streaming-data')
        await page.locator('#phase').evaluate((element) => {
          element.textContent =
            'Complete items appear while the run continues.';
        });
      await page.waitForTimeout(400);
      await generate(page);
      const draft = page.getByTestId('draft-list');
      await expect(draft.getByRole('listitem')).toHaveCount(1);
      await expect(draft).toContainText('2 × Apples');
      if (mode === 'streaming-data')
        await page.locator('#phase').evaluate((element) => {
          element.textContent =
            'One complete item. More data is still arriving.';
        });
      await expect(
        page.getByRole('button', { name: 'Apply list', exact: true }),
      ).toBeDisabled();
      if (capture && mode === 'streaming-data')
        await page.screenshot({
          path: resolve(work, 'streaming-data-partial.png'),
        });
      await expect(draft.getByRole('listitem')).toHaveCount(2);
      if (mode === 'streaming-data')
        await page.locator('#phase').evaluate((element) => {
          element.textContent =
            'Both items are visible. Apply waits for the run to finish.';
        });
      await expect(
        page.getByRole('button', { name: 'Apply list', exact: true }),
      ).toBeDisabled();
      await ready(page);
      if (mode === 'streaming-data')
        await page.locator('#phase').evaluate((element) => {
          element.textContent = 'Run finished. Validate, review, then apply.';
        });
      await expect(
        page.getByTestId('applied-list').getByRole('listitem'),
      ).toHaveCount(0);
      await page.waitForTimeout(600);
      await page
        .getByRole('button', { name: 'Apply list', exact: true })
        .click();
      await expect(
        page.getByTestId('applied-list').getByRole('listitem'),
      ).toHaveCount(2);
      await page.waitForTimeout(800);
      if (errors.length) throw new Error(errors.join('\n'));
      if (!requests.at(-1)?.forwardedProps?.['hashbrown'])
        throw new Error('Missing response schema envelope');
      if (capture) {
        const bounds = await page.locator('main').boundingBox();
        if (!bounds || bounds.y + bounds.height > 748)
          throw new Error(
            'Recording overlaps footer ' + JSON.stringify(bounds),
          );
        const frame = resolve(work, `${mode}-frame.png`);
        await page.screenshot({ path: frame });
        const crop = [bounds.width, bounds.height, bounds.x, bounds.y]
          .map(Math.round)
          .join(':');
        execFileSync(
          'ffmpeg',
          [
            '-y',
            '-i',
            frame,
            '-vf',
            `crop=${crop}`,
            resolve(assets, `${mode}-result.png`),
          ],
          { stdio: 'ignore' },
        );
      }
      const video = page.video();
      await context.close();
      if (capture && video) encode(mode, await video.path());
      results.push({
        sdk,
        mode,
        progressiveItems: true,
        explicitApply: true,
        passed: true,
      });
      console.log(`${sdk}/${mode}: passed`);
    }
    // Verify adverse endings with the exact same clients; no new public media.
    terminalPause = 1_000;
    const context = await browser.newContext({
      viewport: { width: 1440, height: 810 },
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}/${sdk}-structured.html`);
    await generate(page);
    await ready(page);
    await page.getByRole('button', { name: 'Apply list', exact: true }).click();
    const applied = await page
      .getByTestId('applied-list')
      .getByRole('listitem')
      .allTextContents();
    for (const outcome of [
      'invalid',
      'failed',
      'partial',
      'empty',
      'truncated',
      'malformed',
    ] as const) {
      console.log(`${sdk}/${outcome}: verifying rejection`);
      await generate(page, outcome);
      await expect(
        page.getByRole('button', { name: 'Generate draft', exact: true }),
      ).toBeEnabled();
      try {
        await expect(
          page.getByRole('button', { name: 'Apply list', exact: true }),
        ).toBeDisabled();
      } catch (error) {
        await page.screenshot({
          path: resolve(work, `${sdk}-${outcome}-failure.png`),
        });
        writeFileSync(
          resolve(work, `${sdk}-${outcome}-failure.txt`),
          await page.locator('main').innerText(),
        );
        throw error;
      }
      await expect(
        page.getByTestId('applied-list').getByRole('listitem'),
      ).toHaveText(applied);
      results.push({ sdk, outcome, rejected: true, preservedApplied: true });
    }
    terminalPause = 2_000;
    await generate(page);
    await expect(
      page.getByTestId('draft-list').getByRole('listitem'),
    ).toHaveCount(2);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('cancelled');
    await page.waitForTimeout(2_200);
    await expect(
      page.getByRole('button', { name: 'Apply list', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByTestId('applied-list').getByRole('listitem'),
    ).toHaveText(applied);
    terminalPause = 1_000;
    await generate(page);
    await ready(page);
    results.push({ sdk, cancelAfterValidOutput: true, recovery: true });
    if (errors.length) throw new Error(`${sdk}: ${errors.join('\n')}`);
    await context.close();
  }
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
